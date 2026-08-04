import type { SQLiteDatabase } from 'expo-sqlite';

/**
 * Local schema, mirroring the Postgres schema in @dailynote/db column for column.
 *
 * SQLite has no boolean and no timestamp type, so:
 * - booleans are stored as integer 0/1
 * - timestamps are stored as ISO-8601 text, which sorts correctly as text
 *
 * The full sync column set is here from day one even though sync is Phase 4.
 */

const MIGRATIONS: readonly ((db: SQLiteDatabase) => Promise<void>)[] = [
  // v1 -- initial schema
  async (db) => {
    await db.execAsync(`
      create table notes (
        id              text primary key not null,
        user_id         text,
        body            text not null,
        title           text,

        root_id         text not null,
        parent_id       text references notes(id) on delete set null,
        kind            text not null default 'note' check (kind in ('note', 'update')),

        next_review_at  text,
        review_interval integer,
        review_count    integer not null default 0,
        archived_at     text,
        completed_at    text,

        source          text not null default 'composer'
                          check (source in ('composer', 'share', 'shortcut', 'import', 'clipboard')),
        source_ref      text,

        visibility      text not null default 'private'
                          check (visibility in ('private', 'unlisted', 'public')),
        published_at    text,
        local_only      integer not null default 0,

        created_at      text not null,
        updated_at      text not null,
        deleted         integer not null default 0,

        constraint private_is_unpublished check (visibility <> 'private' or published_at is null)
      );

      create index notes_updated_idx on notes (updated_at desc);
      create index notes_review_idx  on notes (next_review_at);
      create index notes_root_idx    on notes (root_id);
    `);
  },

  // v2 -- the block document behind rich text.
  //
  // Nullable with no backfill: a null `doc` is a plain-text note, which the
  // client reads as a document of paragraphs. `body` remains the plain-text
  // projection, so every existing read path is untouched.
  async (db) => {
    await db.execAsync('alter table notes add column doc text;');
  },

  // v3 -- notebooks, locking and pinning.
  //
  // A note with a null notebook_id is in the Default notebook. Modelling the
  // default as "no row" rather than a seeded row means there is no per-install
  // id to reconcile when sync lands, and no way for a user to delete the
  // bucket their notes fall back into.
  async (db) => {
    await db.execAsync(`
      create table notebooks (
        id          text primary key not null,
        user_id     text,
        name        text not null,
        -- Palette key, not a hex value: notebooks re-theme with the app.
        color       text not null default 'swatch',
        sort_order  integer not null default 0,

        created_at  text not null,
        updated_at  text not null,
        deleted     integer not null default 0
      );

      alter table notes add column notebook_id text
        references notebooks(id) on delete set null;

      -- Notes hidden behind the device lock. See lib/lock.ts.
      alter table notes add column locked integer not null default 0;

      -- Manual pin to the top of the list, independent of updated_at.
      alter table notes add column pinned_at text;

      create index notes_notebook_idx on notes (notebook_id);
      create index notebooks_sort_idx on notebooks (sort_order);
    `);
  },

  // v4 -- the social layer.
  //
  // Two shapes live here. `profiles`, `follows`, `reactions`, `blocks` and
  // `reports` mirror the Postgres tables column for column, as everything else
  // in this file does. `feed_items` does not: it is the local mirror of the
  // *published* set -- other people's public threads plus your own -- which is
  // a cache of a server view rather than a table anybody owns. It exists so the
  // feed renders instantly and reads offline; a sync failure costs staleness,
  // never a blank screen.
  async (db) => {
    await db.execAsync(`
      alter table notes add column slug text;
      -- A post written straight to the feed, rather than a private note the
      -- author later chose to share. The only structural difference between
      -- the two, and the notes composer never sets it.
      alter table notes add column born_public integer not null default 0;
      alter table notes add column view_count integer not null default 0;

      create unique index notes_slug_idx on notes (slug) where slug is not null;

      create table profiles (
        id           text primary key not null,
        handle       text not null unique,
        display_name text,
        bio          text,
        avatar_url   text,
        created_at   text not null,
        updated_at   text not null
      );

      -- Who this device is. At most one row, forever: the check pins it.
      create table social_identity (
        id         integer primary key check (id = 1),
        profile_id text not null references profiles(id) on delete cascade
      );

      create table follows (
        follower_id text not null references profiles(id) on delete cascade,
        followee_id text not null references profiles(id) on delete cascade,
        created_at  text not null,
        primary key (follower_id, followee_id),
        constraint no_self_follow check (follower_id <> followee_id)
      );

      create table reactions (
        note_id    text not null,
        user_id    text not null references profiles(id) on delete cascade,
        created_at text not null,
        primary key (note_id, user_id)
      );

      create table blocks (
        blocker_id text not null references profiles(id) on delete cascade,
        blocked_id text not null references profiles(id) on delete cascade,
        created_at text not null,
        primary key (blocker_id, blocked_id),
        constraint no_self_block check (blocker_id <> blocked_id)
      );

      create table reports (
        id          text primary key not null,
        reporter_id text,
        note_id     text,
        reason      text not null,
        status      text not null default 'open'
                      check (status in ('open', 'actioned', 'dismissed')),
        created_at  text not null
      );

      create table feed_items (
        id           text primary key not null,
        author_id    text not null references profiles(id) on delete cascade,
        slug         text not null,
        born_public  integer not null default 0,
        title        text,
        body         text not null,
        doc          text,
        published_at text not null,
        -- The last thing that happened to the thread. What the feed sorts on:
        -- a six-week-old thread coming back with "done" is the interesting
        -- event, not the day it was created.
        active_at    text not null,
        completed_at text,
        update_count integer not null default 0,
        like_count   integer not null default 0,
        view_count   integer not null default 0
      );

      create index feed_items_active_idx on feed_items (active_at desc);
      create index feed_items_author_idx on feed_items (author_id);
      create index follows_followee_idx  on follows (followee_id);
    `);
  },
];

/**
 * Applies any migrations the local database has not seen, tracked with SQLite's
 * built-in `user_version` pragma. Append to MIGRATIONS; never edit one in place
 * once it has shipped.
 */
export async function migrate(db: SQLiteDatabase): Promise<void> {
  await db.execAsync('pragma journal_mode = WAL; pragma foreign_keys = ON;');

  const row = await db.getFirstAsync<{ user_version: number }>('pragma user_version');
  let version = row?.user_version ?? 0;

  for (let index = version; index < MIGRATIONS.length; index++) {
    const migration = MIGRATIONS[index]!;
    await db.withTransactionAsync(async () => {
      await migration(db);
    });
    version = index + 1;
    // pragma does not accept a bound parameter, hence the interpolation. The
    // value is a loop counter, never user input.
    await db.execAsync(`pragma user_version = ${version}`);
  }
}
