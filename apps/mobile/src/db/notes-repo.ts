import type { Block, Note } from '@dailynote/core';
import { createNote, editBody, editContent } from '@dailynote/core';
import * as Crypto from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

/**
 * All note persistence goes through here.
 *
 * This interface exists because the storage decision (plan section 0.2 --
 * Legend-State key-value blobs vs. real SQLite tables) is still open pending the
 * spike. Every read path in the app is one of these five methods, so switching
 * the implementation later means rewriting this file and nothing else.
 */
export interface NotesRepo {
  all(): Promise<Note[]>;
  /** Soft-deleted notes, most recently deleted first. Powers Recently deleted. */
  deleted(): Promise<Note[]>;
  get(id: string): Promise<Note | null>;
  create(body: string, options?: CreateOptions): Promise<Note>;
  update(id: string, patch: Partial<Note>): Promise<void>;
  setBody(id: string, body: string): Promise<Note | null>;
  /** Rich-text edit: writes the document and its plain-text projection together. */
  setContent(id: string, blocks: readonly Block[]): Promise<Note | null>;
  softDelete(id: string): Promise<void>;
  restore(id: string): Promise<void>;
  /** Irreversible. Only reachable from Recently deleted. */
  purge(id: string): Promise<void>;
  purgeAll(): Promise<void>;
}

export interface CreateOptions {
  /** The block document. Omit for a plain-text note. */
  doc?: string | null;
  source?: Note['source'];
  sourceRef?: string | null;
  localOnly?: boolean;
  rootId?: string;
  parentId?: string | null;
  kind?: Note['kind'];
  notebookId?: string | null;
  /** Set only by the feed composer. The note composer must never pass this. */
  bornPublic?: boolean;
}

/** Client-generated UUIDs: offline-safe, and public URLs need no remap later. */
export function newId(): string {
  return Crypto.randomUUID();
}

interface NoteRow {
  id: string;
  user_id: string | null;
  body: string;
  title: string | null;
  doc: string | null;
  notebook_id: string | null;
  locked: number;
  pinned_at: string | null;
  root_id: string;
  parent_id: string | null;
  kind: string;
  next_review_at: string | null;
  review_interval: number | null;
  review_count: number;
  archived_at: string | null;
  completed_at: string | null;
  source: string;
  source_ref: string | null;
  visibility: string;
  published_at: string | null;
  local_only: number;
  slug: string | null;
  born_public: number;
  created_at: string;
  updated_at: string;
  deleted: number;
}

function toNote(row: NoteRow): Note {
  return {
    id: row.id,
    userId: row.user_id,
    body: row.body,
    title: row.title,
    doc: row.doc,
    notebookId: row.notebook_id,
    locked: row.locked === 1,
    pinnedAt: row.pinned_at,
    rootId: row.root_id,
    parentId: row.parent_id,
    kind: row.kind as Note['kind'],
    nextReviewAt: row.next_review_at,
    reviewInterval: row.review_interval,
    reviewCount: row.review_count,
    archivedAt: row.archived_at,
    completedAt: row.completed_at,
    source: row.source as Note['source'],
    sourceRef: row.source_ref,
    visibility: row.visibility as Note['visibility'],
    publishedAt: row.published_at,
    localOnly: row.local_only === 1,
    slug: row.slug,
    bornPublic: row.born_public === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deleted: row.deleted === 1,
  };
}

/** camelCase note field -> snake_case column. The only place the mapping lives. */
const COLUMNS: Record<keyof Note, string> = {
  id: 'id',
  userId: 'user_id',
  body: 'body',
  title: 'title',
  doc: 'doc',
  notebookId: 'notebook_id',
  locked: 'locked',
  pinnedAt: 'pinned_at',
  rootId: 'root_id',
  parentId: 'parent_id',
  kind: 'kind',
  nextReviewAt: 'next_review_at',
  reviewInterval: 'review_interval',
  reviewCount: 'review_count',
  archivedAt: 'archived_at',
  completedAt: 'completed_at',
  source: 'source',
  sourceRef: 'source_ref',
  visibility: 'visibility',
  publishedAt: 'published_at',
  localOnly: 'local_only',
  slug: 'slug',
  bornPublic: 'born_public',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  deleted: 'deleted',
};

function toColumnValue(value: unknown): string | number | null {
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (value === undefined) return null;
  return value as string | number | null;
}

export function createNotesRepo(db: SQLiteDatabase): NotesRepo {
  return {
    async all() {
      // Pinned notes float to the top, most recently pinned first; everything
      // else falls back to recency. `pinned_at is null` sorts 0 before 1, so
      // ascending on that expression puts pinned rows first.
      const rows = await db.getAllAsync<NoteRow>(
        `select * from notes where deleted = 0
         order by pinned_at is null, pinned_at desc, updated_at desc`,
      );
      return rows.map(toNote);
    },

    async deleted() {
      const rows = await db.getAllAsync<NoteRow>(
        'select * from notes where deleted = 1 order by updated_at desc',
      );
      return rows.map(toNote);
    },

    async get(id) {
      const row = await db.getFirstAsync<NoteRow>('select * from notes where id = ?', id);
      return row ? toNote(row) : null;
    },

    async create(body, options = {}) {
      const note = createNote({ id: newId(), body, ...options }, new Date());

      const keys = Object.keys(COLUMNS) as (keyof Note)[];
      const columns = keys.map((key) => COLUMNS[key]).join(', ');
      const placeholders = keys.map(() => '?').join(', ');
      const values = keys.map((key) => toColumnValue(note[key]));

      await db.runAsync(`insert into notes (${columns}) values (${placeholders})`, values);
      return note;
    },

    async update(id, patch) {
      const keys = (Object.keys(patch) as (keyof Note)[]).filter(
        (key) => key !== 'id' && key in COLUMNS,
      );
      if (keys.length === 0) return;

      // updated_at is maintained here rather than by a trigger so a single write
      // stays a single statement; the server trigger is the authority once
      // sync lands (Phase 4).
      const withTimestamp: (keyof Note)[] = keys.includes('updatedAt')
        ? keys
        : [...keys, 'updatedAt'];
      const values = withTimestamp.map((key) =>
        key === 'updatedAt' && !keys.includes('updatedAt')
          ? new Date().toISOString()
          : toColumnValue(patch[key]),
      );

      const assignments = withTimestamp.map((key) => `${COLUMNS[key]} = ?`).join(', ');
      await db.runAsync(`update notes set ${assignments} where id = ?`, [...values, id]);
    },

    async setBody(id, body) {
      const existing = await this.get(id);
      if (existing === null) return null;

      const next = editBody(existing, body, new Date());
      await this.update(id, {
        body: next.body,
        doc: next.doc,
        title: next.title,
        updatedAt: next.updatedAt,
      });
      return next;
    },

    async setContent(id, blocks) {
      const existing = await this.get(id);
      if (existing === null) return null;

      const next = editContent(existing, blocks, new Date());
      await this.update(id, {
        body: next.body,
        doc: next.doc,
        title: next.title,
        updatedAt: next.updatedAt,
      });
      return next;
    },

    async softDelete(id) {
      await this.update(id, { deleted: true });
    },

    async restore(id) {
      await this.update(id, { deleted: false });
    },

    async purge(id) {
      await db.runAsync('delete from notes where id = ?', id);
    },

    async purgeAll() {
      await db.runAsync('delete from notes where deleted = 1');
    },
  };
}
