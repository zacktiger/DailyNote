/**
 * The domain types. These mirror the `notes` table in @dailynote/db one-for-one,
 * but use plain ISO-8601 strings for timestamps so the same objects survive
 * SQLite, Postgres and JSON without a serialization layer.
 */

export type NoteKind = 'note' | 'update';

export type NoteSource = 'composer' | 'share' | 'shortcut' | 'import' | 'clipboard';

export type Visibility = 'private' | 'unlisted' | 'public';

/** ISO-8601 instant, e.g. `2026-07-26T09:15:00.000Z`. */
export type Timestamp = string;

export interface Note {
  id: string;
  /** Null until the user creates an account (Phase 4). */
  userId: string | null;

  body: string;
  /** Derived from the first line and cached. See `deriveTitle`. */
  title: string | null;

  // --- filing ---
  /** Null means the Default notebook, which is the absence of a notebook. */
  notebookId: string | null;
  /** Hidden from the list until the device lock is satisfied. */
  locked: boolean;
  /** Non-null sorts the note above unpinned ones, newest pin first. */
  pinnedAt: Timestamp | null;

  // --- threading / follow-through ---
  /** Equals `id` for a root note. A thread is a root plus its updates. */
  rootId: string;
  parentId: string | null;
  kind: NoteKind;

  // --- review engine ---
  /** Null means "not a commitment". Non-null means it comes back. */
  nextReviewAt: Timestamp | null;
  /** Days until the next review after the current one. */
  reviewInterval: number | null;
  reviewCount: number;
  archivedAt: Timestamp | null;
  completedAt: Timestamp | null;

  // --- provenance ---
  source: NoteSource;
  /** URL, package name or file path, depending on `source`. */
  sourceRef: string | null;

  // --- publishing (Rollout 2 seam; unused in Rollout 1) ---
  visibility: Visibility;
  publishedAt: Timestamp | null;
  /** Never leaves the device. Excluded from the outbound sync set. */
  localOnly: boolean;

  // --- sync ---
  createdAt: Timestamp;
  updatedAt: Timestamp;
  /** Soft delete. A hard delete would break `changesSince` sync. */
  deleted: boolean;
}

/** The shape the composer hands to the store; everything else is defaulted. */
export interface NewNoteInput {
  id: string;
  body: string;
  source?: NoteSource;
  sourceRef?: string | null;
  localOnly?: boolean;
  /** Set for an update note; defaults to a new root thread. */
  rootId?: string;
  parentId?: string | null;
  kind?: NoteKind;
  notebookId?: string | null;
}

/**
 * A user-created folder for notes.
 *
 * There is deliberately no row for the Default notebook: a note with a null
 * `notebookId` is in it. That keeps the fallback bucket undeletable and avoids
 * a per-install id to reconcile when sync lands.
 */
export interface Notebook {
  id: string;
  userId: string | null;
  name: string;
  /** A palette key (see the mobile theme), never a hex value. */
  color: string;
  sortOrder: number;

  createdAt: Timestamp;
  updatedAt: Timestamp;
  deleted: boolean;
}

/** The sentinel the UI uses for "everything", distinct from a real id. */
export const ALL_NOTES = '__all__';

/** The sentinel for the null-notebookId bucket. */
export const DEFAULT_NOTEBOOK = '__default__';

/** What the notes list is currently filtered to. */
export type NotebookFilter = string;
