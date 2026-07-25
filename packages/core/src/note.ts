import { deriveTitle } from './title';
import type { NewNoteInput, Note } from './types';

/**
 * Builds a fully-defaulted note from composer input.
 *
 * `id` is supplied by the caller rather than generated here: IDs are
 * client-generated UUIDs so notes are offline-safe and their eventual public
 * URLs need no remapping (plan section 5). Keeping generation out of core keeps
 * core free of crypto/platform imports.
 */
export function createNote(input: NewNoteInput, now: Date): Note {
  const timestamp = now.toISOString();

  return {
    id: input.id,
    userId: null,
    body: input.body,
    title: deriveTitle(input.body),

    rootId: input.rootId ?? input.id,
    parentId: input.parentId ?? null,
    kind: input.kind ?? 'note',

    nextReviewAt: null,
    reviewInterval: null,
    reviewCount: 0,
    archivedAt: null,
    completedAt: null,

    source: input.source ?? 'composer',
    sourceRef: input.sourceRef ?? null,

    visibility: 'private',
    publishedAt: null,
    localOnly: input.localOnly ?? false,

    createdAt: timestamp,
    updatedAt: timestamp,
    deleted: false,
  };
}

/** Edits a note's body, keeping the cached title in sync. */
export function editBody(note: Note, body: string, now: Date): Note {
  return { ...note, body, title: deriveTitle(body), updatedAt: now.toISOString() };
}

/** A thread is a root note plus its updates, oldest first. */
export function threadOf(notes: readonly Note[], rootId: string): Note[] {
  return notes
    .filter((note) => note.rootId === rootId && !note.deleted)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

/** True for notes that must never be included in the outbound sync set. */
export function isSyncable(note: Note): boolean {
  return !note.localOnly;
}
