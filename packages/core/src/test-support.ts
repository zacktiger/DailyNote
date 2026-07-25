import { createNote } from './note';
import type { Note } from './types';

/** Builds a note with sane defaults for tests. Not exported from the package. */
export function makeNote(overrides: Partial<Note> = {}): Note {
  const base = createNote(
    { id: overrides.id ?? 'note-1', body: overrides.body ?? 'a note' },
    new Date('2026-01-01T09:00:00.000Z'),
  );
  return { ...base, ...overrides };
}
