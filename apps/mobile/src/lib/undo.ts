import { useCallback, useRef, useState } from 'react';

export interface History<T> {
  value: T;
  canUndo: boolean;
  canRedo: boolean;
  /** Records a new value. Consecutive edits coalesce into one entry. */
  set: (value: T, options?: { discrete?: boolean }) => void;
  undo: () => T | null;
  redo: () => T | null;
  /** Replaces the value without recording history, e.g. when loading a note. */
  reset: (value: T) => void;
}

/** How long a run of typing keeps folding into a single undo entry. */
const COALESCE_MS = 700;

/**
 * Undo/redo over one immutable value.
 *
 * Generic over the value because the editor's content is a block document, not
 * a string: every edit already produces a whole new `Block[]`, so snapshots are
 * just the values that have been through here.
 *
 * Typing coalesces so that one Undo does not walk back a character at a time,
 * but anything a toolbar does is recorded discretely -- bulleting a line and
 * then undoing it should put the bullet back, not eat the word before it.
 */
export function useHistory<T>(initial: T): History<T> {
  const [value, setValue] = useState<T>(initial);

  const past = useRef<T[]>([]);
  const future = useRef<T[]>([]);
  const current = useRef<T>(initial);
  const lastEntryAt = useRef(0);

  // Depth is mirrored in state so the toolbar's undo/redo buttons re-render
  // when they become available; the refs stay the source of truth.
  const [depth, setDepth] = useState({ past: 0, future: 0 });

  const set = useCallback<History<T>['set']>((next, options) => {
    const previous = current.current;
    if (Object.is(previous, next)) return;

    const now = Date.now();
    const discrete = options?.discrete === true;
    const coalesce = !discrete && now - lastEntryAt.current < COALESCE_MS && past.current.length > 0;

    if (!coalesce) past.current.push(previous);
    lastEntryAt.current = discrete ? 0 : now;

    future.current = [];
    current.current = next;
    setValue(next);
    setDepth({ past: past.current.length, future: 0 });
  }, []);

  const undo = useCallback(() => {
    const entry = past.current.pop();
    if (entry === undefined) return null;

    future.current.push(current.current);
    current.current = entry;
    lastEntryAt.current = 0;
    setValue(entry);
    setDepth({ past: past.current.length, future: future.current.length });
    return entry;
  }, []);

  const redo = useCallback(() => {
    const entry = future.current.pop();
    if (entry === undefined) return null;

    past.current.push(current.current);
    current.current = entry;
    lastEntryAt.current = 0;
    setValue(entry);
    setDepth({ past: past.current.length, future: future.current.length });
    return entry;
  }, []);

  const reset = useCallback((next: T) => {
    past.current = [];
    future.current = [];
    current.current = next;
    lastEntryAt.current = 0;
    setValue(next);
    setDepth({ past: 0, future: 0 });
  }, []);

  return { value, canUndo: depth.past > 0, canRedo: depth.future > 0, set, undo, redo, reset };
}
