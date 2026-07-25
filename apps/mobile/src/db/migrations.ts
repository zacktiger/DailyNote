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
