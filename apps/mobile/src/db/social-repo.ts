import type { FeedItem, Profile } from '@dailynote/core';
import type { SQLiteDatabase } from 'expo-sqlite';

import { newId } from './notes-repo';

/**
 * Reads the signed-in account id, or null.
 *
 * Passed in rather than read from a table because the session is owned by
 * Supabase and can change under the app at any time -- a token refresh, a sign
 * out on another device. Holding a copy in SQLite would mean two answers to
 * "who am I" and a way for them to disagree.
 */
export type CurrentUserId = () => string | null;

/**
 * All social persistence goes through here.
 *
 * Same contract as `notes-repo`: every read path in the social layer is one of
 * these methods, so when the server exists this file is reimplemented over HTTP
 * and nothing else changes. That matters more here than for notes, because this
 * data is *inherently* remote -- the local tables are a mirror of a published
 * set that lives somewhere else, not the system of record.
 *
 * The one rule from plan-rollout-2 section 0 that shapes this file: feed
 * composition is not a query. These methods return rows; `composeFeed` in
 * @dailynote/core decides what a reader may see and in what order, because that
 * is logic worth unit-testing rather than burying in SQL.
 */
export interface SocialRepo {
  // --- identity ---
  /** The signed-in account's profile, or null when signed out or unclaimed. */
  me(): Promise<Profile | null>;
  /** Claims a handle for the signed-in account. Null when signed out. */
  claim(handle: string, displayName: string | null): Promise<Profile | null>;
  updateMe(patch: ProfilePatch): Promise<Profile | null>;
  profile(id: string): Promise<Profile | null>;
  profileByHandle(handle: string): Promise<Profile | null>;
  /** True if somebody already has it. Checked before a claim, not after. */
  handleTaken(handle: string): Promise<boolean>;
  upsertProfile(profile: Profile): Promise<void>;

  // --- the published set ---
  /** Every mirrored item, with the reader's own like state resolved. */
  items(): Promise<FeedItem[]>;
  item(id: string): Promise<FeedItem | null>;
  byAuthor(authorId: string): Promise<FeedItem[]>;
  /** The slugs an author has used, so a new one can avoid them. */
  slugsFor(authorId: string): Promise<string[]>;
  /** Adds or replaces the mirror row for a published thread. */
  mirror(item: MirrorInput): Promise<void>;
  /** Removes it. Unpublishing means gone, not hidden. */
  unmirror(id: string): Promise<void>;
  recordView(id: string): Promise<void>;

  // --- the graph ---
  following(): Promise<Set<string>>;
  setFollowing(authorId: string, following: boolean): Promise<void>;
  followCounts(authorId: string): Promise<{ followers: number; following: number }>;
  setLiked(itemId: string, liked: boolean): Promise<void>;

  // --- safety ---
  /** Symmetric: ids you blocked and ids that blocked you. */
  blocked(): Promise<Set<string>>;
  setBlocked(authorId: string, blocked: boolean): Promise<void>;
  report(itemId: string, reason: string): Promise<void>;
}

export interface ProfilePatch {
  displayName?: string | null;
  bio?: string | null;
  avatarUrl?: string | null;
}

/** What `mirror` needs. Author details are read back from `profiles` on select. */
export interface MirrorInput {
  id: string;
  authorId: string;
  slug: string;
  bornPublic: boolean;
  title: string | null;
  body: string;
  doc: string | null;
  publishedAt: string;
  activeAt: string;
  completedAt: string | null;
  updateCount: number;
}

interface ProfileRow {
  id: string;
  handle: string;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

interface ItemRow {
  id: string;
  author_id: string;
  handle: string;
  display_name: string | null;
  avatar_url: string | null;
  slug: string;
  born_public: number;
  title: string | null;
  body: string;
  doc: string | null;
  published_at: string;
  active_at: string;
  completed_at: string | null;
  update_count: number;
  like_count: number;
  view_count: number;
  liked_by_me: number;
}

function toProfile(row: ProfileRow): Profile {
  return {
    id: row.id,
    handle: row.handle,
    displayName: row.display_name,
    bio: row.bio,
    avatarUrl: row.avatar_url,
    createdAt: row.created_at,
  };
}

function toItem(row: ItemRow): FeedItem {
  return {
    id: row.id,
    authorId: row.author_id,
    handle: row.handle,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    slug: row.slug,
    bornPublic: row.born_public === 1,
    title: row.title,
    body: row.body,
    doc: row.doc,
    publishedAt: row.published_at,
    activeAt: row.active_at,
    completedAt: row.completed_at,
    updateCount: row.update_count,
    likeCount: row.like_count,
    likedByMe: row.liked_by_me === 1,
    viewCount: row.view_count,
  };
}

/**
 * A feed row joined to its author and to the reader's own like.
 *
 * The like count is counted from `reactions` rather than kept as a column on
 * `feed_items`: a denormalized counter and a reaction row are two things that
 * can disagree, and at one device's scale the count is free.
 */
const ITEM_SELECT = `
  select f.*,
         p.handle, p.display_name, p.avatar_url,
         (select count(*) from reactions r where r.note_id = f.id) as like_count,
         exists (
           select 1 from reactions r
            where r.note_id = f.id and r.user_id = ?
         ) as liked_by_me
    from feed_items f
    join profiles p on p.id = f.author_id
`;

export function createSocialRepo(db: SQLiteDatabase, currentUserId: CurrentUserId): SocialRepo {
  /** The reader's id, or a sentinel that matches no row when signed out. */
  function myId(): string {
    return currentUserId() ?? '';
  }

  return {
    async me() {
      const id = myId();
      if (id === '') return null;

      const row = await db.getFirstAsync<ProfileRow>('select * from profiles where id = ?', id);
      return row ? toProfile(row) : null;
    },

    async claim(handle, displayName) {
      // The profile *is* the account, keyed by the same id. There is no path
      // to a second identity on one account, and no local id to reconcile
      // against the server later.
      const id = myId();
      if (id === '') return null;

      const now = new Date().toISOString();
      const profile: Profile = {
        id,
        handle,
        displayName,
        bio: null,
        avatarUrl: null,
        createdAt: now,
      };

      await db.runAsync(
        `insert into profiles (id, handle, display_name, bio, avatar_url, created_at, updated_at)
         values (?, ?, ?, null, null, ?, ?)`,
        [profile.id, profile.handle, profile.displayName, now, now],
      );

      return profile;
    },

    async updateMe(patch) {
      const id = myId();
      if (id === '') return null;

      const columns: Record<keyof ProfilePatch, string> = {
        displayName: 'display_name',
        bio: 'bio',
        avatarUrl: 'avatar_url',
      };
      const keys = (Object.keys(patch) as (keyof ProfilePatch)[]).filter(
        (key) => patch[key] !== undefined,
      );
      if (keys.length > 0) {
        const assignments = keys.map((key) => `${columns[key]} = ?`).join(', ');
        await db.runAsync(
          `update profiles set ${assignments}, updated_at = ? where id = ?`,
          [...keys.map((key) => patch[key] ?? null), new Date().toISOString(), id],
        );
      }
      return this.profile(id);
    },

    async profile(id) {
      const row = await db.getFirstAsync<ProfileRow>('select * from profiles where id = ?', id);
      return row ? toProfile(row) : null;
    },

    async profileByHandle(handle) {
      const row = await db.getFirstAsync<ProfileRow>(
        'select * from profiles where handle = ?',
        handle,
      );
      return row ? toProfile(row) : null;
    },

    async handleTaken(handle) {
      const row = await db.getFirstAsync<{ count: number }>(
        'select count(*) as count from profiles where handle = ?',
        handle,
      );
      return (row?.count ?? 0) > 0;
    },

    async upsertProfile(profile) {
      const now = new Date().toISOString();
      await db.runAsync(
        `insert into profiles (id, handle, display_name, bio, avatar_url, created_at, updated_at)
         values (?, ?, ?, ?, ?, ?, ?)
         on conflict(id) do update set
           handle = excluded.handle,
           display_name = excluded.display_name,
           bio = excluded.bio,
           avatar_url = excluded.avatar_url,
           updated_at = excluded.updated_at`,
        [
          profile.id,
          profile.handle,
          profile.displayName,
          profile.bio,
          profile.avatarUrl,
          profile.createdAt,
          now,
        ],
      );
    },

    async items() {
      const rows = await db.getAllAsync<ItemRow>(
        `${ITEM_SELECT} order by f.active_at desc`,
        myId(),
      );
      return rows.map(toItem);
    },

    async item(id) {
      const row = await db.getFirstAsync<ItemRow>(`${ITEM_SELECT} where f.id = ?`, [
        myId(),
        id,
      ]);
      return row ? toItem(row) : null;
    },

    async byAuthor(authorId) {
      const rows = await db.getAllAsync<ItemRow>(
        `${ITEM_SELECT} where f.author_id = ? order by f.active_at desc`,
        [myId(), authorId],
      );
      return rows.map(toItem);
    },

    async slugsFor(authorId) {
      const rows = await db.getAllAsync<{ slug: string }>(
        'select slug from feed_items where author_id = ?',
        authorId,
      );
      return rows.map((row) => row.slug);
    },

    async mirror(input) {
      await db.runAsync(
        `insert into feed_items
           (id, author_id, slug, born_public, title, body, doc,
            published_at, active_at, completed_at, update_count, like_count, view_count)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0)
         on conflict(id) do update set
           slug = excluded.slug,
           title = excluded.title,
           body = excluded.body,
           doc = excluded.doc,
           active_at = excluded.active_at,
           completed_at = excluded.completed_at,
           update_count = excluded.update_count`,
        [
          input.id,
          input.authorId,
          input.slug,
          input.bornPublic ? 1 : 0,
          input.title,
          input.body,
          input.doc,
          input.publishedAt,
          input.activeAt,
          input.completedAt,
          input.updateCount,
        ],
      );
    },

    async unmirror(id) {
      // Reactions go with it. A like on a thread nobody can read is an orphan
      // row that would resurrect a stale count if the author republished.
      await db.withTransactionAsync(async () => {
        await db.runAsync('delete from reactions where note_id = ?', id);
        await db.runAsync('delete from feed_items where id = ?', id);
      });
    },

    async recordView(id) {
      await db.runAsync('update feed_items set view_count = view_count + 1 where id = ?', id);
    },

    async following() {
      const rows = await db.getAllAsync<{ followee_id: string }>(
        'select followee_id from follows where follower_id = ?',
        myId(),
      );
      return new Set(rows.map((row) => row.followee_id));
    },

    async setFollowing(authorId, following) {
      const id = myId();
      if (id === '' || id === authorId) return;

      if (following) {
        await db.runAsync(
          `insert into follows (follower_id, followee_id, created_at) values (?, ?, ?)
           on conflict do nothing`,
          [id, authorId, new Date().toISOString()],
        );
      } else {
        await db.runAsync('delete from follows where follower_id = ? and followee_id = ?', [
          id,
          authorId,
        ]);
      }
    },

    async followCounts(authorId) {
      const followers = await db.getFirstAsync<{ count: number }>(
        'select count(*) as count from follows where followee_id = ?',
        authorId,
      );
      const following = await db.getFirstAsync<{ count: number }>(
        'select count(*) as count from follows where follower_id = ?',
        authorId,
      );
      return { followers: followers?.count ?? 0, following: following?.count ?? 0 };
    },

    async setLiked(itemId, liked) {
      const id = myId();
      if (id === '') return;

      if (liked) {
        await db.runAsync(
          `insert into reactions (note_id, user_id, created_at) values (?, ?, ?)
           on conflict do nothing`,
          [itemId, id, new Date().toISOString()],
        );
      } else {
        await db.runAsync('delete from reactions where note_id = ? and user_id = ?', [itemId, id]);
      }
    },

    async blocked() {
      const id = myId();
      const rows = await db.getAllAsync<{ blocker_id: string; blocked_id: string }>(
        'select blocker_id, blocked_id from blocks where blocker_id = ? or blocked_id = ?',
        [id, id],
      );
      // Symmetric on purpose: blocking someone hides you from them as well,
      // which is what people mean by the word.
      const ids = new Set<string>();
      for (const row of rows) {
        if (row.blocker_id === id) ids.add(row.blocked_id);
        if (row.blocked_id === id) ids.add(row.blocker_id);
      }
      return ids;
    },

    async setBlocked(authorId, blocked) {
      const id = myId();
      if (id === '' || id === authorId) return;

      if (blocked) {
        await db.withTransactionAsync(async () => {
          await db.runAsync(
            `insert into blocks (blocker_id, blocked_id, created_at) values (?, ?, ?)
             on conflict do nothing`,
            [id, authorId, new Date().toISOString()],
          );
          // Blocking implies unfollowing. Leaving the edge would put them back
          // in the feed the moment the block came off, which is not what
          // anyone expects from the word.
          await db.runAsync('delete from follows where follower_id = ? and followee_id = ?', [
            id,
            authorId,
          ]);
        });
      } else {
        await db.runAsync('delete from blocks where blocker_id = ? and blocked_id = ?', [
          id,
          authorId,
        ]);
      }
    },

    async report(itemId, reason) {
      const id = myId();
      await db.runAsync(
        `insert into reports (id, reporter_id, note_id, reason, status, created_at)
         values (?, ?, ?, ?, 'open', ?)`,
        [newId(), id === '' ? null : id, itemId, reason, new Date().toISOString()],
      );
    },
  };
}
