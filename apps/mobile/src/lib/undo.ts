import { useCallback, useRef, useState } from 'react';

import type { Selection } from '@dailynote/core';

/** One point in the edit history: the text and where the caret was in it. */
export interface Snapshot {
  text: string;
  selection: Selection;
}

export interface History {
  value: string;
  canUndo: boolean;
  canRedo: boolean;
  /** Records a new value. Consecutive typing coalesces into one entry. */
  set: (text: string, selection: Selection, options?: { discrete?: boolean }) => void;
  undo: () => Snapshot | null;
  redo: () => Snapshot | null;
  /** Replaces the value without recording history, e.g. when loading a note. */
  reset: (text: string) => void;
}

/** How long a run of typing keeps folding into a single undo entry. */
const COALESCE_MS = 700;

/**
 * Undo/redo over a single text value.
 *
 * Typing coalesces so that one Undo does not walk back a character at a time,
 * but anything the toolbar does is recorded discretely -- applying a heading
 * and then undoing it should put the heading back, not eat the word before it.
 */
export function useHistory(initial: string): History {
  const [value, setValue] = useState(initial);

  const past = useRef<Snapshot[]>([]);
  const future = useRef<Snapshot[]>([]);
  const current = useRef<Snapshot>({ text: initial, selection: { start: 0, end: 0 } });
  const lastEntryAt = useRef(0);

  // Depth is mirrored in state so the toolbar's undo/redo buttons re-render
  // when they become available; the refs stay the source of truth.
  const [depth, setDepth] = useState({ past: 0, future: 0 });

  const set = useCallback<History['set']>((text, selection, options) => {
    const previous = current.current;
    if (previous.text === text) {
      current.current = { text, selection };
      return;
    }

    const now = Date.now();
    const discrete = options?.discrete === true;
    const coalesce = !discrete && now - lastEntryAt.current < COALESCE_MS && past.current.length > 0;

    if (!coalesce) past.current.push(previous);
    lastEntryAt.current = discrete ? 0 : now;

    future.current = [];
    current.current = { text, selection };
    setValue(text);
    setDepth({ past: past.current.length, future: 0 });
  }, []);

  const undo = useCallback(() => {
    const entry = past.current.pop();
    if (entry === undefined) return null;

    future.current.push(current.current);
    current.current = entry;
    lastEntryAt.current = 0;
    setValue(entry.text);
    setDepth({ past: past.current.length, future: future.current.length });
    return entry;
  }, []);

  const redo = useCallback(() => {
    const entry = future.current.pop();
    if (entry === undefined) return null;

    past.current.push(current.current);
    current.current = entry;
    lastEntryAt.current = 0;
    setValue(entry.text);
    setDepth({ past: past.current.length, future: future.current.length });
    return entry;
  }, []);

  const reset = useCallback((text: string) => {
    past.current = [];
    future.current = [];
    current.current = { text, selection: { start: 0, end: 0 } };
    lastEntryAt.current = 0;
    setValue(text);
    setDepth({ past: 0, future: 0 });
  }, []);

  return { value, canUndo: depth.past > 0, canRedo: depth.future > 0, set, undo, redo, reset };
}
