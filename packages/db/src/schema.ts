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
  uniqueIndex,
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

    // --- publishing ---
    visibility: text('visibility').notNull().default('private'),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    /** Never leaves the device. Enforced in the sync layer, not by RLS. */
    localOnly: boolean('local_only').notNull().default(false),
    /** The readable half of `/@handle/slug`. Unique per author, null until published. */
    slug: text('slug'),
    /** Written straight to the feed rather than shared from the private library. */
    bornPublic: boolean('born_public').notNull().default(false),
    /**
     * A counter on the row, not a table of view events.
     *
     * Per-view rows are the fastest route to a hundred-million-row table nobody
     * queries. The API increments this; nothing reads individual views.
     */
    viewCount: integer('view_count').notNull().default(0),

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
    /**
     * ADR 0002 makes `local_only` the entire privacy pressure valve, so it gets
     * a database guarantee rather than a code path that could be forgotten.
     */
    check(
      'local_only_is_private',
      sql`${table.localOnly} = false or ${table.visibility} = 'private'`,
    ),
    /** A public note has an address; a private one has none to leak. */
    check(
      'published_has_slug',
      sql`${table.visibility} = 'private' or ${table.slug} is not null`,
    ),

    /** The sync pull: everything of mine that changed since the last sync. */
    index('notes_user_updated_idx').on(table.userId, table.updatedAt),
    /** The Today screen: my open commitments that have come due. */
    index('notes_user_review_idx').on(table.userId, table.nextReviewAt),
    /** Thread assembly. */
    index('notes_root_idx').on(table.rootId),
    /** The public URL lookup, and the guarantee that two of yours never collide. */
    uniqueIndex('notes_user_slug_idx')
      .on(table.userId, table.slug)
      .where(sql`${table.slug} is not null`),
  ],
);

// --- the social layer -------------------------------------------------------

/**
 * A face on an account.
 *
 * Keyed by the account id rather than carrying its own, so there is exactly one
 * identity per user and no way to accumulate a second.
 */
export const profiles = pgTable(
  'profiles',
  {
    id: uuid('id')
      .primaryKey()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    /** The format check forbids uppercase, so plain text is already case-unique. */
    handle: text('handle').notNull().unique(),
    displayName: text('display_name'),
    bio: text('bio'),
    avatarUrl: text('avatar_url'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [check('handle_format', sql`${table.handle} ~ '^[a-z0-9_]{3,30}$'`)],
);

export const follows = pgTable(
  'follows',
  {
    followerId: uuid('follower_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    followeeId: uuid('followee_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.followerId, table.followeeId] }),
    check('no_self_follow', sql`${table.followerId} <> ${table.followeeId}`),
    /** "Who follows me", which the primary key's column order cannot answer. */
    index('follows_followee_idx').on(table.followeeId),
  ],
);

/**
 * One reaction kind, deliberately.
 *
 * Six emoji would force every reader to decide what a 😂 means on a note about
 * something painful. One ambiguous positive signal avoids the question entirely
 * -- decision 3 in plan-rollout-2.
 */
export const reactions = pgTable(
  'reactions',
  {
    noteId: uuid('note_id')
      .notNull()
      .references(() => notes.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.noteId, table.userId] }),
    index('reactions_note_idx').on(table.noteId),
  ],
);

/**
 * Blocks and reports are not a later phase.
 *
 * App Store guideline 1.2 requires a report mechanism and a block mechanism
 * before a user-generated-content app may ship at all, so they exist from the
 * first moment anything is publicly readable.
 */
export const blocks = pgTable(
  'blocks',
  {
    blockerId: uuid('blocker_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    blockedId: uuid('blocked_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.blockerId, table.blockedId] }),
    check('no_self_block', sql`${table.blockerId} <> ${table.blockedId}`),
  ],
);

export const reports = pgTable(
  'reports',
  {
    id: uuid('id').primaryKey(),
    /** Null once the reporter deletes their account; the report still stands. */
    reporterId: uuid('reporter_id').references(() => profiles.id, { onDelete: 'set null' }),
    noteId: uuid('note_id').references(() => notes.id, { onDelete: 'cascade' }),
    reason: text('reason').notNull(),
    status: text('status').notNull().default('open'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check('reports_status_check', sql`${table.status} in ('open', 'actioned', 'dismissed')`),
    /** The queue: open reports, oldest first. Guideline 1.2 gives you 24 hours. */
    index('reports_status_idx').on(table.status, table.createdAt),
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
