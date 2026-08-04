/**
 * Block and inline formatting over a plain-text note body.
 *
 * A React Native `TextInput` renders one uniform text style, so a WYSIWYG rich
 * text model is not available to us without embedding a web view. Instead the
 * body stays plain text carrying Markdown-ish markers -- `## `, `- `, `1. `,
 * `- [ ] `, `**bold**` -- exactly the way the reference editor shows literal
 * `1.` / `2.` / `3.` markers as you type a numbered list.
 *
 * Everything here is a pure string transform so the whole toolbar is testable
 * without a simulator. Each function takes the body plus the current selection
 * and returns the new body plus where the selection should end up, because a
 * toolbar that moves the caret to the wrong place feels broken even when the
 * text is right.
 */

/** Paragraph-level style, mapped to the reference's Title/Subtitle/... chips. */
export type BlockStyle = 'title' | 'subtitle' | 'heading' | 'body' | 'note';

/** List decoration, independent of `BlockStyle`. */
export type ListStyle = 'none' | 'bullet' | 'numbered' | 'checklist';

/** Whole-note text alignment. A TextInput cannot align lines individually. */
export type Align = 'left' | 'center' | 'right';

export type InlineMark = 'bold' | 'italic' | 'underline' | 'strikethrough';

/** A caret (start === end) or a range, in UTF-16 offsets into the body. */
export interface Selection {
  start: number;
  end: number;
}

/** The result of every transform: new text, and where to put the caret. */
export interface Edit {
  text: string;
  selection: Selection;
}

/** One nesting level of indent. Two spaces keeps deep lists readable. */
export const INDENT_UNIT = '  ';

/** Beyond this, indentation eats the whole line width on a phone. */
export const MAX_INDENT = 4;

const HEADING_MARKERS: Record<Exclude<BlockStyle, 'body'>, string> = {
  title: '# ',
  subtitle: '## ',
  heading: '### ',
  note: '> ',
};

const INLINE_MARKERS: Record<InlineMark, readonly [string, string]> = {
  bold: ['**', '**'],
  italic: ['*', '*'],
  underline: ['<u>', '</u>'],
  strikethrough: ['~~', '~~'],
};

/** A line broken into its markers and its text. */
export interface ParsedLine {
  /** Nesting level, in `INDENT_UNIT`s. */
  indent: number;
  style: BlockStyle;
  list: ListStyle;
  /** For `list === 'numbered'`, the number actually written on the line. */
  number: number;
  /** For `list === 'checklist'`, whether the box is ticked. */
  checked: boolean;
  /** The line with every marker stripped. */
  content: string;
}

const CHECKLIST_RE = /^- \[([ xX])\] ?/;
const BULLET_RE = /^[-*] /;
const NUMBERED_RE = /^(\d+)\. /;
const HEADING_RE = /^(#{1,3}) /;
const NOTE_RE = /^> ?/;

/** Splits one line into indent, block style, list marker and content. */
export function parseLine(line: string): ParsedLine {
  const leading = /^ */.exec(line)?.[0].length ?? 0;
  const indent = Math.min(Math.floor(leading / INDENT_UNIT.length), MAX_INDENT);
  let rest = line.slice(leading);

  let style: BlockStyle = 'body';
  const heading = HEADING_RE.exec(rest);
  if (heading !== null) {
    const level = heading[1]!.length;
    style = level === 1 ? 'title' : level === 2 ? 'subtitle' : 'heading';
    rest = rest.slice(heading[0].length);
  } else if (NOTE_RE.test(rest)) {
    style = 'note';
    rest = rest.replace(NOTE_RE, '');
  }

  let list: ListStyle = 'none';
  let number = 0;
  let checked = false;

  // Checklist first: `- [ ] x` also matches the bullet pattern.
  const check = CHECKLIST_RE.exec(rest);
  const numbered = NUMBERED_RE.exec(rest);
  if (check !== null) {
    list = 'checklist';
    checked = check[1]!.toLowerCase() === 'x';
    rest = rest.slice(check[0].length);
  } else if (BULLET_RE.test(rest)) {
    list = 'bullet';
    rest = rest.replace(BULLET_RE, '');
  } else if (numbered !== null) {
    list = 'numbered';
    number = Number.parseInt(numbered[1]!, 10);
    rest = rest.slice(numbered[0].length);
  }

  return { indent, style, list, number, checked, content: rest };
}

/** The inverse of `parseLine`. */
export function formatLine(line: ParsedLine): string {
  const indent = INDENT_UNIT.repeat(Math.min(Math.max(line.indent, 0), MAX_INDENT));
  const style = line.style === 'body' ? '' : HEADING_MARKERS[line.style];
  const list =
    line.list === 'bullet'
      ? '- '
      : line.list === 'numbered'
        ? `${Math.max(line.number, 1)}. `
        : line.list === 'checklist'
          ? `- [${line.checked ? 'x' : ' '}] `
          : '';
  return `${indent}${style}${list}${line.content}`;
}

/** The marker prefix a line carries, i.e. everything before its content. */
export function markerOf(line: ParsedLine): string {
  return formatLine({ ...line, content: '' });
}

// --- line addressing -------------------------------------------------------

/** Offset of the start of the line containing `offset`. */
function lineStart(text: string, offset: number): number {
  return text.lastIndexOf('\n', Math.max(offset - 1, 0)) + 1;
}

/** Offset of the end of the line containing `offset`, excluding the newline. */
function lineEnd(text: string, offset: number): number {
  const index = text.indexOf('\n', offset);
  return index === -1 ? text.length : index;
}

/** The full-line span covering every line the selection touches. */
export function lineSpan(text: string, selection: Selection): Selection {
  const start = Math.min(selection.start, selection.end);
  const end = Math.max(selection.start, selection.end);
  return { start: lineStart(text, start), end: lineEnd(text, end) };
}

/**
 * Rewrites every line the selection touches, preserving the selection as best
 * it can: the caret keeps its offset within its own line, so re-styling the
 * line the user is typing on does not throw them back to the start of it.
 */
function mapLines(
  text: string,
  selection: Selection,
  transform: (line: ParsedLine, index: number) => ParsedLine,
): Edit {
  const span = lineSpan(text, selection);
  const before = text.slice(0, span.start);
  const after = text.slice(span.end);
  const lines = text.slice(span.start, span.end).split('\n');

  const firstMarkerBefore = markerOf(parseLine(lines[0] ?? '')).length;
  const rewritten = lines.map((line, index) => formatLine(transform(parseLine(line), index)));
  const firstMarkerAfter = markerOf(parseLine(rewritten[0] ?? '')).length;

  const shift = firstMarkerAfter - firstMarkerBefore;
  const body = rewritten.join('\n');
  const next = `${before}${body}${after}`;

  // Keep the caret glued to the character it was on, but never let it slide
  // in front of the marker it now sits behind.
  const clamp = (offset: number) => {
    if (offset < span.start) return offset;
    const moved = offset + shift;
    return Math.max(span.start + firstMarkerAfter, Math.min(moved, before.length + body.length));
  };

  return {
    text: next,
    selection: { start: clamp(selection.start), end: clamp(selection.end) },
  };
}

// --- block style -----------------------------------------------------------

/** The style shared by every selected line, or 'body' when they disagree. */
export function blockStyleAt(text: string, selection: Selection): BlockStyle {
  const span = lineSpan(text, selection);
  const styles = text
    .slice(span.start, span.end)
    .split('\n')
    .map((line) => parseLine(line).style);
  const first = styles[0] ?? 'body';
  return styles.every((style) => style === first) ? first : 'body';
}

/**
 * Applies a paragraph style. Re-applying the current style reverts to body, so
 * the chips behave as toggles the way the reference's do.
 */
export function applyBlockStyle(text: string, selection: Selection, style: BlockStyle): Edit {
  const current = blockStyleAt(text, selection);
  const next = current === style ? 'body' : style;
  // A heading and a list marker on one line reads as neither, so taking a
  // paragraph style clears the list, and vice versa.
  return mapLines(text, selection, (line) => ({
    ...line,
    style: next,
    list: next === 'body' ? line.list : 'none',
  }));
}

// --- lists -----------------------------------------------------------------

/** The list style shared by every selected line, or 'none' when they disagree. */
export function listStyleAt(text: string, selection: Selection): ListStyle {
  const span = lineSpan(text, selection);
  const styles = text
    .slice(span.start, span.end)
    .split('\n')
    .map((line) => parseLine(line).list);
  const first = styles[0] ?? 'none';
  return styles.every((style) => style === first) ? first : 'none';
}

/** Applies a list style, toggling back to no list when already applied. */
export function applyListStyle(text: string, selection: Selection, list: ListStyle): Edit {
  const current = listStyleAt(text, selection);
  const next = current === list ? 'none' : list;
  const edit = mapLines(text, selection, (line, index) => ({
    ...line,
    list: next,
    number: index + 1,
    checked: next === 'checklist' ? line.checked : false,
    style: next === 'none' ? line.style : 'body',
  }));
  return { ...edit, text: renumber(edit.text) };
}

/** Ticks or unticks the checklist item on the line containing `offset`. */
export function toggleChecked(text: string, offset: number): Edit {
  const start = lineStart(text, offset);
  const end = lineEnd(text, offset);
  const line = parseLine(text.slice(start, end));
  if (line.list !== 'checklist') return { text, selection: { start: offset, end: offset } };

  const rewritten = formatLine({ ...line, checked: !line.checked });
  return {
    text: `${text.slice(0, start)}${rewritten}${text.slice(end)}`,
    selection: { start: offset, end: offset },
  };
}

/** Shifts the selected lines one nesting level in or out. */
export function changeIndent(text: string, selection: Selection, delta: number): Edit {
  const edit = mapLines(text, selection, (line) => ({
    ...line,
    indent: Math.min(Math.max(line.indent + delta, 0), MAX_INDENT),
  }));
  return { ...edit, text: renumber(edit.text) };
}

/**
 * Rewrites the numbers on ordered lists so they read 1, 2, 3.
 *
 * Numbering restarts per indent level and per run: a blank line, a
 * differently-styled line, or an outdent all begin a new list.
 */
export function renumber(text: string): string {
  const counters = new Map<number, number>();
  let previousIndent: number | null = null;

  return text
    .split('\n')
    .map((raw) => {
      const line = parseLine(raw);

      if (line.list !== 'numbered') {
        // A blank line ends every open list; a non-numbered line of content
        // only ends the lists nested at or below it.
        if (line.content.trim().length === 0 && line.list === 'none') counters.clear();
        previousIndent = null;
        return raw;
      }

      if (previousIndent !== null && line.indent < previousIndent) {
        for (const level of [...counters.keys()]) {
          if (level > line.indent) counters.delete(level);
        }
      }

      const number = (counters.get(line.indent) ?? 0) + 1;
      counters.set(line.indent, number);
      previousIndent = line.indent;
      return formatLine({ ...line, number });
    })
    .join('\n');
}

/**
 * What pressing Enter should produce inside a list.
 *
 * Returns null when the caret is not in a list item, letting the TextInput
 * insert an ordinary newline. An Enter on an empty item ends the list instead
 * of adding another empty one -- otherwise there is no way out but backspace.
 */
export function continueList(text: string, selection: Selection): Edit | null {
  if (selection.start !== selection.end) return null;

  const offset = selection.start;
  const start = lineStart(text, offset);
  const line = parseLine(text.slice(start, lineEnd(text, offset)));
  if (line.list === 'none') return null;

  if (line.content.trim().length === 0) {
    // Empty item: outdent first if it is nested, and only drop the marker at
    // the top level, matching how every list editor people already use behaves.
    const cleared =
      line.indent > 0
        ? formatLine({ ...line, indent: line.indent - 1, content: '' })
        : formatLine({ ...line, list: 'none', style: 'body', content: '' });
    const end = lineEnd(text, offset);
    const next = `${text.slice(0, start)}${cleared}${text.slice(end)}`;
    const caret = start + cleared.length;
    return { text: renumber(next), selection: { start: caret, end: caret } };
  }

  const marker = markerOf({
    ...line,
    number: line.number + 1,
    checked: false,
    // A new list item is body text even when continuing a styled line.
    style: 'body',
  });
  const inserted = `\n${marker}`;
  const next = `${text.slice(0, offset)}${inserted}${text.slice(offset)}`;
  const caret = offset + inserted.length;
  return { text: renumber(next), selection: { start: caret, end: caret } };
}

// --- inline marks ----------------------------------------------------------

/** True when the selection is already wrapped in the given mark. */
export function hasInlineMark(text: string, selection: Selection, mark: InlineMark): boolean {
  const [open, close] = INLINE_MARKERS[mark];
  const start = Math.min(selection.start, selection.end);
  const end = Math.max(selection.start, selection.end);
  const inner = text.slice(start, end);

  if (inner.startsWith(open) && inner.endsWith(close) && inner.length >= open.length + close.length) {
    return true;
  }
  return text.slice(start - open.length, start) === open && text.slice(end, end + close.length) === close;
}

/**
 * Wraps the selection in a mark, or unwraps it when already marked.
 *
 * With an empty selection this inserts the marker pair and puts the caret
 * between them, so tapping B and typing produces bold text.
 */
export function toggleInlineMark(text: string, selection: Selection, mark: InlineMark): Edit {
  const [open, close] = INLINE_MARKERS[mark];
  const start = Math.min(selection.start, selection.end);
  const end = Math.max(selection.start, selection.end);
  const inner = text.slice(start, end);

  // Markers inside the selection.
  if (inner.startsWith(open) && inner.endsWith(close) && inner.length >= open.length + close.length) {
    const stripped = inner.slice(open.length, inner.length - close.length);
    return {
      text: `${text.slice(0, start)}${stripped}${text.slice(end)}`,
      selection: { start, end: start + stripped.length },
    };
  }

  // Markers hugging the selection.
  if (
    text.slice(start - open.length, start) === open &&
    text.slice(end, end + close.length) === close
  ) {
    return {
      text: `${text.slice(0, start - open.length)}${inner}${text.slice(end + close.length)}`,
      selection: { start: start - open.length, end: end - open.length },
    };
  }

  const wrapped = `${open}${inner}${close}`;
  return {
    text: `${text.slice(0, start)}${wrapped}${text.slice(end)}`,
    selection:
      start === end
        ? { start: start + open.length, end: start + open.length }
        : { start, end: start + wrapped.length },
  };
}

// --- reading ---------------------------------------------------------------

/** Removes bold/italic/underline/strikethrough markers, keeping their text. */
export function stripInlineMarks(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/~~(.+?)~~/g, '$1')
    .replace(/<\/?u>/g, '')
    .replace(/\*(.+?)\*/g, '$1');
}

/** Strips every marker, for previews, search and the title. */
export function toPlainText(text: string): string {
  return stripInlineMarks(
    text
      .split('\n')
      .map((line) => parseLine(line).content)
      .join('\n'),
  );
}

/** Characters in the note, markers excluded. The editor's meta line shows this. */
export function characterCount(text: string): number {
  return toPlainText(text).replace(/\s/g, '').length;
}
