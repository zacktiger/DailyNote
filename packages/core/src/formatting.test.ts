import { describe, expect, it } from 'vitest';

import {
  applyBlockStyle,
  applyListStyle,
  blockStyleAt,
  changeIndent,
  characterCount,
  continueList,
  formatLine,
  hasInlineMark,
  listStyleAt,
  parseLine,
  renumber,
  toggleChecked,
  toggleInlineMark,
  toPlainText,
} from './formatting';

/** Marks the caret in a fixture with `|`, so tests read like the editor. */
function at(fixture: string) {
  const start = fixture.indexOf('|');
  const end = fixture.indexOf('|', start + 1);
  if (end === -1) {
    return { text: fixture.replace('|', ''), selection: { start, end: start } };
  }
  return {
    text: fixture.replace(/\|/g, ''),
    selection: { start, end: end - 1 },
  };
}

/** Renders an Edit back into the `|`-marked form for comparison. */
function show(edit: { text: string; selection: { start: number; end: number } }) {
  const { text, selection } = edit;
  if (selection.start === selection.end) {
    return `${text.slice(0, selection.start)}|${text.slice(selection.start)}`;
  }
  return `${text.slice(0, selection.start)}|${text.slice(selection.start, selection.end)}|${text.slice(selection.end)}`;
}

describe('parseLine', () => {
  it('reads a plain line as body text', () => {
    expect(parseLine('hello')).toMatchObject({
      indent: 0,
      style: 'body',
      list: 'none',
      content: 'hello',
    });
  });

  it.each([
    ['# Title', 'title'],
    ['## Subtitle', 'subtitle'],
    ['### Heading', 'heading'],
    ['> Note', 'note'],
  ])('reads %s as %s', (line, style) => {
    expect(parseLine(line).style).toBe(style);
  });

  it('reads a bullet', () => {
    expect(parseLine('- milk')).toMatchObject({ list: 'bullet', content: 'milk' });
  });

  it('reads a numbered item and keeps its number', () => {
    expect(parseLine('3. third')).toMatchObject({ list: 'numbered', number: 3, content: 'third' });
  });

  it.each([
    ['- [ ] open', false],
    ['- [x] done', true],
    ['- [X] done', true],
  ])('reads the checkbox in %s', (line, checked) => {
    expect(parseLine(line)).toMatchObject({ list: 'checklist', checked });
  });

  it('prefers checklist over bullet, since a checkbox also starts with "- "', () => {
    expect(parseLine('- [ ] task').list).toBe('checklist');
  });

  it('counts indentation in two-space units', () => {
    expect(parseLine('    - deep').indent).toBe(2);
  });

  it('caps indentation at the maximum nesting level', () => {
    expect(parseLine(`${' '.repeat(40)}- far`).indent).toBe(4);
  });

  it('round-trips through formatLine', () => {
    for (const line of ['  - [x] done', '### Heading', '2. second', '> quiet', 'plain']) {
      expect(formatLine(parseLine(line))).toBe(line);
    }
  });
});

describe('applyBlockStyle', () => {
  it('adds the marker and keeps the caret on its character', () => {
    const { text, selection } = at('hel|lo');
    expect(show(applyBlockStyle(text, selection, 'heading'))).toBe('### hel|lo');
  });

  it('toggles back to body when the style is already applied', () => {
    const { text, selection } = at('### hel|lo');
    expect(show(applyBlockStyle(text, selection, 'heading'))).toBe('hel|lo');
  });

  it('swaps one heading level for another', () => {
    const { text, selection } = at('# Ti|tle');
    expect(applyBlockStyle(text, selection, 'subtitle').text).toBe('## Title');
  });

  it('clears a list marker, since a bulleted heading reads as neither', () => {
    const { text, selection } = at('- ite|m');
    expect(applyBlockStyle(text, selection, 'heading').text).toBe('### item');
  });

  it('styles every line the selection touches', () => {
    const { text, selection } = at('|one\ntwo|');
    expect(applyBlockStyle(text, selection, 'subtitle').text).toBe('## one\n## two');
  });

  it('leaves lines outside the selection alone', () => {
    const { text, selection } = at('before\non|e\nafter');
    expect(applyBlockStyle(text, selection, 'title').text).toBe('before\n# one\nafter');
  });

  it('never lets the caret fall in front of the marker', () => {
    const { text, selection } = at('|hello');
    expect(show(applyBlockStyle(text, selection, 'title'))).toBe('# |hello');
  });
});

describe('blockStyleAt', () => {
  it('reports the shared style of a multi-line selection', () => {
    const { text, selection } = at('|## one\n## two|');
    expect(blockStyleAt(text, selection)).toBe('subtitle');
  });

  it('falls back to body when the lines disagree', () => {
    const { text, selection } = at('|# one\n## two|');
    expect(blockStyleAt(text, selection)).toBe('body');
  });
});

describe('applyListStyle', () => {
  it('bullets the current line', () => {
    const { text, selection } = at('mi|lk');
    expect(show(applyListStyle(text, selection, 'bullet'))).toBe('- mi|lk');
  });

  it('toggles the list off when reapplied', () => {
    const { text, selection } = at('- mi|lk');
    expect(applyListStyle(text, selection, 'bullet').text).toBe('milk');
  });

  it('numbers a selection from one', () => {
    const { text, selection } = at('|one\ntwo\nthree|');
    expect(applyListStyle(text, selection, 'numbered').text).toBe('1. one\n2. two\n3. three');
  });

  it('converts bullets to a checklist, keeping the text', () => {
    const { text, selection } = at('|- one\n- two|');
    expect(applyListStyle(text, selection, 'checklist').text).toBe('- [ ] one\n- [ ] two');
  });

  it('preserves ticks when a checklist is re-applied over itself', () => {
    const { text, selection } = at('|- [x] one\n- [ ] two|');
    expect(applyListStyle(text, selection, 'bullet').text).toBe('- one\n- two');
  });

  it('drops the heading marker, matching applyBlockStyle in reverse', () => {
    const { text, selection } = at('### hea|ding');
    expect(applyListStyle(text, selection, 'bullet').text).toBe('- heading');
  });
});

describe('listStyleAt', () => {
  it('reports a uniform list style', () => {
    const { text, selection } = at('|- one\n- two|');
    expect(listStyleAt(text, selection)).toBe('bullet');
  });

  it('reports none when the lines disagree', () => {
    const { text, selection } = at('|- one\n1. two|');
    expect(listStyleAt(text, selection)).toBe('none');
  });
});

describe('toggleChecked', () => {
  it('ticks an open box', () => {
    expect(toggleChecked('- [ ] task', 3).text).toBe('- [x] task');
  });

  it('unticks a ticked box', () => {
    expect(toggleChecked('- [x] task', 3).text).toBe('- [ ] task');
  });

  it('ticks only the line the offset is on', () => {
    const text = '- [ ] one\n- [ ] two';
    expect(toggleChecked(text, 12).text).toBe('- [ ] one\n- [x] two');
  });

  it('does nothing on a line that is not a checklist item', () => {
    expect(toggleChecked('- bullet', 3).text).toBe('- bullet');
  });
});

describe('changeIndent', () => {
  it('indents by one level', () => {
    const { text, selection } = at('- it|em');
    expect(changeIndent(text, selection, 1).text).toBe('  - item');
  });

  it('outdents by one level', () => {
    const { text, selection } = at('  - it|em');
    expect(changeIndent(text, selection, -1).text).toBe('- item');
  });

  it('will not outdent past the left margin', () => {
    const { text, selection } = at('- it|em');
    expect(changeIndent(text, selection, -1).text).toBe('- item');
  });

  it('will not indent past the nesting cap', () => {
    const { text, selection } = at(`${'  '.repeat(4)}- it|em`);
    expect(changeIndent(text, selection, 1).text).toBe(`${'  '.repeat(4)}- item`);
  });

  it('renumbers so a nested run starts at one again', () => {
    const { text, selection } = at('1. one\n2. t|wo');
    expect(changeIndent(text, selection, 1).text).toBe('1. one\n  1. two');
  });
});

describe('renumber', () => {
  it('fixes a run that is all ones', () => {
    expect(renumber('1. a\n1. b\n1. c')).toBe('1. a\n2. b\n3. c');
  });

  it('restarts after a blank line', () => {
    expect(renumber('1. a\n2. b\n\n1. x\n1. y')).toBe('1. a\n2. b\n\n1. x\n2. y');
  });

  it('numbers each indent level independently', () => {
    expect(renumber('1. a\n  1. x\n  1. y\n1. b')).toBe('1. a\n  1. x\n  2. y\n2. b');
  });

  it('restarts a nested run after returning to the outer level', () => {
    expect(renumber('1. a\n  1. x\n1. b\n  1. y')).toBe('1. a\n  1. x\n2. b\n  1. y');
  });

  it('leaves bullets and plain lines untouched', () => {
    expect(renumber('- a\ntext\n- b')).toBe('- a\ntext\n- b');
  });
});

describe('continueList', () => {
  it('returns null outside a list, so Enter inserts a plain newline', () => {
    const { text, selection } = at('plain|');
    expect(continueList(text, selection)).toBeNull();
  });

  it('continues a bullet', () => {
    const { text, selection } = at('- milk|');
    expect(show(continueList(text, selection)!)).toBe('- milk\n- |');
  });

  it('continues a numbered list with the next number', () => {
    const { text, selection } = at('1. one\n2. two|');
    expect(show(continueList(text, selection)!)).toBe('1. one\n2. two\n3. |');
  });

  it('continues a checklist with an unticked box', () => {
    const { text, selection } = at('- [x] done|');
    expect(show(continueList(text, selection)!)).toBe('- [x] done\n- [ ] |');
  });

  it('keeps the indent of the item it continues', () => {
    const { text, selection } = at('  - deep|');
    expect(show(continueList(text, selection)!)).toBe('  - deep\n  - |');
  });

  it('outdents an empty nested item rather than adding another', () => {
    const { text, selection } = at('- one\n  - |');
    expect(show(continueList(text, selection)!)).toBe('- one\n- |');
  });

  it('ends the list on an empty top-level item', () => {
    const { text, selection } = at('- one\n- |');
    expect(show(continueList(text, selection)!)).toBe('- one\n|');
  });

  it('renumbers what follows when splitting a numbered list', () => {
    const { text, selection } = at('1. one|\n2. two');
    expect(continueList(text, selection)!.text).toBe('1. one\n2. \n3. two');
  });

  it('returns null for a range selection, which Enter should replace', () => {
    const { text, selection } = at('- |one|');
    expect(continueList(text, selection)).toBeNull();
  });
});

describe('toggleInlineMark', () => {
  it('wraps a selection', () => {
    const { text, selection } = at('say |hello| there');
    expect(toggleInlineMark(text, selection, 'bold').text).toBe('say **hello** there');
  });

  it('selects the wrapped run so a second tap undoes it', () => {
    const { text, selection } = at('say |hello| there');
    const bolded = toggleInlineMark(text, selection, 'bold');
    expect(toggleInlineMark(bolded.text, bolded.selection, 'bold').text).toBe('say hello there');
  });

  it('unwraps when the markers hug the selection', () => {
    const { text, selection } = at('say **|hello|** there');
    expect(toggleInlineMark(text, selection, 'bold').text).toBe('say hello there');
  });

  it('puts the caret between the markers when nothing is selected', () => {
    const { text, selection } = at('say |');
    expect(show(toggleInlineMark(text, selection, 'bold'))).toBe('say **|**');
  });

  it.each([
    ['bold', '**x**'],
    ['italic', '*x*'],
    ['underline', '<u>x</u>'],
    ['strikethrough', '~~x~~'],
  ] as const)('wraps %s correctly', (mark, expected) => {
    const { text, selection } = at('|x|');
    expect(toggleInlineMark(text, selection, mark).text).toBe(expected);
  });
});

describe('hasInlineMark', () => {
  it('sees markers hugging the selection', () => {
    const { text, selection } = at('**|bold|**');
    expect(hasInlineMark(text, selection, 'bold')).toBe(true);
  });

  it('sees markers inside the selection', () => {
    const { text, selection } = at('|**bold**|');
    expect(hasInlineMark(text, selection, 'bold')).toBe(true);
  });

  it('is false for unmarked text', () => {
    const { text, selection } = at('|plain|');
    expect(hasInlineMark(text, selection, 'bold')).toBe(false);
  });
});

describe('toPlainText', () => {
  it('strips block markers', () => {
    expect(toPlainText('# Title\n- [ ] task\n1. one')).toBe('Title\ntask\none');
  });

  it('strips inline markers', () => {
    expect(toPlainText('**bold** and *italic* and ~~gone~~ and <u>under</u>')).toBe(
      'bold and italic and gone and under',
    );
  });
});

describe('characterCount', () => {
  it('counts content without markers or whitespace', () => {
    expect(characterCount('# Title\n- [ ] a b')).toBe(7);
  });

  it('is zero for an empty note', () => {
    expect(characterCount('')).toBe(0);
  });
});
