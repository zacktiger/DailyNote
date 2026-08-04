import { documentToText, serializeDocument, type Block } from './document';
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
    doc: input.doc ?? null,

    notebookId: input.notebookId ?? null,
    locked: false,
    pinnedAt: null,

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

/**
 * Edits a note's body as plain text, keeping the cached title in sync.
 *
 * Clears `doc`, because after this the body *is* the note -- keeping a stale
 * document beside a body it no longer describes is the one way these two
 * representations can disagree. Rich edits go through `editContent`.
 */
export function editBody(note: Note, body: string, now: Date): Note {
  return { ...note, body, doc: null, title: deriveTitle(body), updatedAt: now.toISOString() };
}

/**
 * Edits a note's content as a block document.
 *
 * Writes the document and its plain-text projection together, in one place, so
 * `body` can never drift from `doc`.
 */
export function editContent(note: Note, blocks: readonly Block[], now: Date): Note {
  const body = documentToText(blocks);

  return {
    ...note,
    body,
    doc: serializeDocument(blocks),
    title: deriveTitle(body),
    updatedAt: now.toISOString(),
  };
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
