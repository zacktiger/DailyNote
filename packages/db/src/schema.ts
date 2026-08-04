import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  boolean,
  check,
  index,
  integer,
  pgSchema,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * Supabase's `auth.users`, declared only so the foreign key on `notes.user_id`
 * is real and drizzle-kit emits it. Supabase owns this table; never migrate it.
 */
const authSchema = pgSchema('auth');
export const authUsers = authSchema.table('users', {
  id: uuid('id').primaryKey(),
});

export const notes = pgTable(
  'notes',
  {
    /** Client-generated so notes are offline-safe and public URLs need no remap. */
    id: uuid('id').primaryKey(),
    /** Nullable until Phase 4 -- the app is usable with no account at all. */
    userId: uuid('user_id').references(() => authUsers.id, { onDelete: 'cascade' }),

    /** The plain-text projection of `doc`. What search and sync read. */
    body: text('body').notNull(),
    /** Derived from the first line and cached. */
    title: text('title'),
    /** The block document as JSON. Null for a plain-text note. */
    doc: text('doc'),

    // --- threading / follow-through ---
    /** Equals `id` for a root note. */
    rootId: uuid('root_id').notNull(),
    parentId: uuid('parent_id').references((): AnyPgColumn => notes.id, { onDelete: 'set null' }),
    kind: text('kind').notNull().default('note'),

    // --- review engine ---
    /** Null means "not a commitment". */
    nextReviewAt: timestamp('next_review_at', { withTimezone: true }),
    /** Days until the next review. */
    reviewInterval: integer('review_interval'),
    reviewCount: integer('review_count').notNull().default(0),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),

    // --- provenance ---
    source: text('source').notNull().default('composer'),
    /** URL, package name or file path. */
    sourceRef: text('source_ref'),

    // --- publishing (Rollout 2 seam; DB-enforced from day one) ---
    visibility: text('visibility').notNull().default('private'),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    /** Never leaves the device. Enforced in the sync layer, not by RLS. */
    localOnly: boolean('local_only').notNull().default(false),

    // --- sync ---
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    /** Trigger-maintained. Legend-State's `changesSince` depends on it. */
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    /** Soft delete -- a hard delete would be invisible to `changesSince`. */
    deleted: boolean('deleted').notNull().default(false),
  },
  (table) => [
    check('notes_kind_check', sql`${table.kind} in ('note', 'update')`),
    check(
      'notes_source_check',
      sql`${table.source} in ('composer', 'share', 'shortcut', 'import', 'clipboard')`,
    ),
    check('notes_visibility_check', sql`${table.visibility} in ('private', 'unlisted', 'public')`),
    check(
      'private_is_unpublished',
      sql`${table.visibility} <> 'private' or ${table.publishedAt} is null`,
    ),

    /** The sync pull: everything of mine that changed since the last sync. */
    index('notes_user_updated_idx').on(table.userId, table.updatedAt),
    /** The Today screen: my open commitments that have come due. */
    index('notes_user_review_idx').on(table.userId, table.nextReviewAt),
    /** Thread assembly. */
    index('notes_root_idx').on(table.rootId),
  ],
);

export const tags = pgTable(
  'tags',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id').references(() => authUsers.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
  },
  (table) => [unique('tags_user_name_unique').on(table.userId, table.name)],
);

export const noteTags = pgTable(
  'note_tags',
  {
    noteId: uuid('note_id')
      .notNull()
      .references(() => notes.id, { onDelete: 'cascade' }),
    tagId: uuid('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
  },
  (table) => [primaryKey({ columns: [table.noteId, table.tagId] })],
);
