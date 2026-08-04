import { bullet, isTextBlock, paragraph, type Block, type TextBlock } from '@dailynote/core';
import { useCallback, useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';
import {
  Platform,
  Pressable,
  Text,
  TextInput,
  type NativeSyntheticEvent,
  type TextInputKeyPressEventData,
  type TextInputSelectionChangeEventData,
} from 'react-native';
import Animated from 'react-native-reanimated';

import * as motion from '@/lib/motion';
import { useTheme } from '@/theme';

/**
 * The writing surface: one `TextInput` per block.
 *
 * A single multiline input cannot give a line its own alignment, hang a bullet
 * in a gutter, or hold an image between two paragraphs -- so a note is a column
 * of blocks, each editable in place, and what you see is what is stored.
 *
 * Two interactions do the structural work, and both are deliberately driven by
 * text rather than key events, because key events are the unreliable part of
 * React Native's text input on Android:
 *
 * - **Enter splits.** The newline arrives through `onChangeText`, and the block
 *   is cut at the caret. A multi-line paste splits into as many blocks.
 * - **Backspace at the start merges** with the block above, which is the one
 *   place `onKeyPress` is needed -- there is no other signal for it.
 *
 * The first paragraph is the note's title. Not a separate field: the first line
 * has always been the title (`deriveTitle`), so this makes it *look* like what
 * it already was.
 */

/** How long a blur waits before it counts, so moving block to block is quiet. */
const BLUR_GRACE_MS = 80;

export interface BlockEditorProps {
  blocks: Block[];
  onChange: (blocks: Block[]) => void;
  /** Shown in the title block while the note is empty. */
  placeholder?: string;
  autoFocus?: boolean;
  /** Which block the caret is in, so a toolbar knows what it is acting on. */
  onFocusChange?: (index: number | null) => void;
  ref?: Ref<BlockEditorHandle>;
}

export interface BlockEditorHandle {
  /** Returns the caret to where it was. For a toolbar that stole the focus. */
  restoreFocus: () => void;
}

interface Caret {
  id: string;
  offset: number;
}

export function BlockEditor({
  blocks,
  onChange,
  placeholder,
  autoFocus,
  onFocusChange,
  ref,
}: BlockEditorProps) {
  const theme = useTheme();

  const inputs = useRef(new Map<string, TextInput | null>());
  /** Last known caret per block, so a keystroke knows where it landed. */
  const selections = useRef(new Map<string, { start: number; end: number }>());

  // Where the caret must go after a structural edit. Held in state for one
  // render: passing `selection` to a TextInput takes control of it, so it is
  // released as soon as the input reports the position back.
  const [caret, setCaret] = useState<Caret | null>(null);

  useEffect(() => {
    if (caret === null) return;
    inputs.current.get(caret.id)?.focus();
  }, [caret]);

  // The block the caret is in. Cleared on a short delay, because moving
  // between two blocks blurs one before it focuses the next -- clearing
  // immediately would flicker the toolbar off and back on every time.
  const focused = useRef<string | null>(null);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (blurTimer.current !== null) clearTimeout(blurTimer.current);
    };
  }, []);

  const report = useCallback(
    (id: string | null) => {
      focused.current = id;
      if (onFocusChange === undefined) return;
      onFocusChange(id === null ? null : blocks.findIndex((block) => block.id === id));
    },
    [blocks, onFocusChange],
  );

  useImperativeHandle(
    ref,
    () => ({
      restoreFocus() {
        const id = focused.current;
        if (id === null) return;
        const selection = selections.current.get(id);
        setCaret({ id, offset: selection?.start ?? 0 });
      },
    }),
    [],
  );

  const focusLast = useCallback(() => {
    const last = [...blocks].reverse().find(isTextBlock);
    if (last === undefined) return;
    setCaret({ id: last.id, offset: last.text.length });
  }, [blocks]);

  const changeText = useCallback(
    (index: number, text: string) => {
      const block = blocks[index];
      if (block === undefined || !isTextBlock(block)) return;

      if (!text.includes('\n')) {
        const next = [...blocks];
        next[index] = { ...block, text };
        onChange(next);
        return;
      }

      // Enter on an empty bullet ends the list rather than adding another
      // empty one -- the way out of a list is the same key that built it.
      if (block.type === 'bullet' && block.text.length === 0 && text === '\n') {
        const next = [...blocks];
        next[index] = { ...block, type: 'paragraph' };
        onChange(next);
        return;
      }

      // A newline appeared: cut the block at the caret. The new blocks inherit
      // this one's type and alignment, so a list goes on being a list and a run
      // of centred lines stays centred.
      const parts = text.split('\n');
      const make = block.type === 'bullet' ? bullet : paragraph;
      const created = parts.slice(1).map((part) => make(part, block.align));

      const next = [...blocks];
      next.splice(index, 1, { ...block, text: parts[0]! }, ...created);
      onChange(next);

      setCaret(caretAfterInsert(block, text, selections.current.get(block.id), parts, created));
    },
    [blocks, onChange],
  );

  const keyPress = useCallback(
    (index: number, event: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
      if (event.nativeEvent.key !== 'Backspace') return;

      const block = blocks[index];
      if (block === undefined || !isTextBlock(block)) return;

      // Only when there is nothing to the left to delete.
      const selection = selections.current.get(block.id);
      if (selection === undefined || selection.start !== 0 || selection.end !== 0) return;

      // This keystroke is the structural edit, and nothing else. Without this
      // the web build also deletes a character: the default action runs after
      // the re-render, by which time the caret sits mid-text somewhere else. A
      // no-op on native, where the caret was at 0 with nothing before it.
      event.preventDefault();

      const next = [...blocks];

      // Backspace leaves the list before it starts deleting text, so the first
      // press un-bullets the line instead of joining it to the one above.
      if (block.type === 'bullet') {
        next[index] = { ...block, type: 'paragraph' };
        onChange(next);
        return;
      }

      if (index === 0) return;
      const above = blocks[index - 1]!;

      if (!isTextBlock(above)) {
        // Backspacing into an image deletes the image, which is what the
        // gesture means -- there is nothing to merge text into.
        next.splice(index - 1, 1);
        onChange(next);
        return;
      }

      // Merge upward, keeping the block above so the caret has somewhere that
      // already exists to land, at the seam between the two texts.
      next.splice(index - 1, 2, { ...above, text: above.text + block.text });
      onChange(next);
      setCaret({ id: above.id, offset: above.text.length });
    },
    [blocks, onChange],
  );

  const selectionChange = useCallback(
    (block: TextBlock, event: NativeSyntheticEvent<TextInputSelectionChangeEventData>) => {
      selections.current.set(block.id, event.nativeEvent.selection);
      // The requested position has been applied; hand the caret back to the user.
      if (caret?.id === block.id) setCaret(null);
    },
    [caret],
  );

  return (
    <>
      {blocks.map((block, index) => {
        if (!isTextBlock(block)) return null;

        // Only a plain first line is the title. Bullet the top line and it
        // becomes an ordinary list item, which is what it now is.
        const isTitle = index === 0 && block.type === 'paragraph';

        return (
          <Animated.View key={block.id} layout={motion.layout} className="flex-row px-5">
            {block.type === 'bullet' ? (
              // A fixed gutter rather than a character in the text: the marker
              // is structure, so it cannot be typed over, and a line that wraps
              // hangs under the first word instead of under the dot.
              <Text className="w-5 font-serif text-[21px] leading-8 text-muted dark:text-muted-dark">
                •
              </Text>
            ) : null}

            <TextInput
              ref={(input) => {
                inputs.current.set(block.id, input);
              }}
              value={block.text}
              onChangeText={(text) => changeText(index, text)}
              onKeyPress={(event) => keyPress(index, event)}
              onSelectionChange={(event) => selectionChange(block, event)}
              onFocus={() => report(block.id)}
              onBlur={() => {
                if (blurTimer.current !== null) clearTimeout(blurTimer.current);
                blurTimer.current = setTimeout(() => {
                  if (focused.current === block.id) report(null);
                }, BLUR_GRACE_MS);
              }}
              selection={caret?.id === block.id ? { start: caret.offset, end: caret.offset } : undefined}
              autoFocus={autoFocus && isTitle}
              multiline
              // A multiline input grows with its content on iOS and Android,
              // but react-native-web renders `<textarea rows={2}>`, which would
              // leave every block two lines tall. Web-only, so native keeps its
              // own sizing.
              numberOfLines={Platform.OS === 'web' ? 1 : undefined}
              // The screen owns scrolling; a block sizes to its own content.
              scrollEnabled={false}
              // The input spans the row, so aligning its text aligns the line,
              // and the caret follows it to the same edge. A style rather than
              // the same-named prop, which react-native-web does not forward.
              style={{ textAlign: block.align }}
              textAlignVertical="top"
              placeholder={isTitle ? placeholder : undefined}
              placeholderTextColor={theme.faint}
              selectionColor={theme.accent}
              className={
                isTitle
                  ? 'flex-1 py-0 font-serif-medium text-[28px] leading-9 text-ink web:outline-none dark:text-ink-dark'
                  : 'flex-1 py-0 font-serif text-[21px] leading-8 text-ink web:outline-none dark:text-ink-dark'
              }
            />
          </Animated.View>
        );
      })}

      {/* The page below the last line is still the page: tapping it puts the
          caret at the end, the way tapping empty paper would. */}
      <Pressable className="min-h-[140px] flex-1" onPress={focusLast} />
    </>
  );
}

/**
 * Where the caret belongs after text was inserted across a block boundary.
 *
 * Enter is the simple case (the caret starts the new block), but a paste of
 * several lines has to land at the end of what was pasted, which may be in the
 * middle of the final block. Both fall out of measuring how much text arrived.
 */
function caretAfterInsert(
  block: TextBlock,
  text: string,
  selection: { start: number; end: number } | undefined,
  parts: string[],
  created: TextBlock[],
): Caret {
  const from = selection ?? { start: block.text.length, end: block.text.length };
  const inserted = Math.max(text.length - block.text.length + (from.end - from.start), 0);

  // Walk the split points until the offset falls inside a part.
  let offset = from.start + inserted;
  let part = 0;
  while (part < parts.length - 1 && offset > parts[part]!.length) {
    offset -= parts[part]!.length + 1;
    part += 1;
  }

  // `parts[0]` stayed in the original block; the rest are the created ones.
  const target = part === 0 ? block : created[part - 1]!;
  return { id: target.id, offset: Math.max(offset, 0) };
}
