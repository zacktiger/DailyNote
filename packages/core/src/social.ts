import type { Note, Timestamp } from './types';

/**
 * The social layer's domain types and pure logic.
 *
 * Everything here is a total function over plain data -- no storage, no network.
 * The mobile app's repo and the API both call into this so that "who can see
 * this", "is this handle legal" and "what order does the feed go in" have one
 * implementation, tested once.
 *
 * The governing rule from plan-rollout-2 section 0: feed composition is *not*
 * expressed in row-level security. It is code, and this is that code.
 */

// --- profiles ---------------------------------------------------------------

export interface Profile {
  /** Matches the account id, so a profile is a face on an account, never a second identity. */
  id: string;
  /** Without the leading `@`. Lowercase, unique across the app. */
  handle: string;
  displayName: string | null;
  bio: string | null;
  /** A local file URI today; object storage once sync lands. */
  avatarUrl: string | null;
  createdAt: Timestamp;
}

export const HANDLE_MIN = 3;
export const HANDLE_MAX = 30;

const HANDLE_PATTERN = /^[a-z0-9_]{3,30}$/;

/**
 * Handles nobody may claim.
 *
 * Two groups: paths the web surface needs for itself, and names that would let
 * someone pass as the app. Impersonation is cheapest to prevent here -- see
 * plan-rollout-2 section 5.
 */
export const RESERVED_HANDLES: ReadonlySet<string> = new Set([
  'about',
  'admin',
  'administrator',
  'api',
  'contact',
  'dailynote',
  'explore',
  'feed',
  'help',
  'home',
  'legal',
  'login',
  'me',
  'moderator',
  'new',
  'notes',
  'official',
  'privacy',
  'root',
  'search',
  'settings',
  'signup',
  'staff',
  'support',
  'system',
  'team',
  'terms',
  'user',
  'www',
]);

/** Strips the decoration people type: `@Name ` -> `name`. */
export function normalizeHandle(input: string): string {
  return input.trim().replace(/^@+/, '').toLowerCase();
}

/**
 * Why a handle can't be used, or null if it can.
 *
 * Returns prose rather than a code because every caller shows it verbatim; a
 * second table mapping codes to sentences would be a table with one reader.
 */
export function handleError(input: string): string | null {
  const handle = normalizeHandle(input);
  if (handle.length === 0) return 'Pick a handle.';
  if (handle.length < HANDLE_MIN) return `At least ${HANDLE_MIN} characters.`;
  if (handle.length > HANDLE_MAX) return `At most ${HANDLE_MAX} characters.`;
  if (!HANDLE_PATTERN.test(handle)) return 'Letters, numbers and underscores only.';
  if (RESERVED_HANDLES.has(handle)) return 'That one is reserved.';
  return null;
}

export function isValidHandle(input: string): boolean {
  return handleError(input) === null;
}

/** What a profile is called in the UI. Never empty: the handle is the floor. */
export function profileName(profile: Profile): string {
  const name = profile.displayName?.trim() ?? '';
  return name.length > 0 ? name : `@${profile.handle}`;
}

// --- slugs ------------------------------------------------------------------

const SLUG_MAX = 60;

/**
 * The readable half of a public URL, derived from the title.
 *
 * Deliberately lossy and deliberately not unique -- `uniqueSlug` handles
 * collisions. A note titled in a script with no ASCII form degrades to the
 * fallback, which is ugly but still a working link.
 */
export function slugify(title: string | null | undefined): string {
  const slug = (title ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX)
    .replace(/-+$/, '');
  return slug.length > 0 ? slug : 'note';
}

/**
 * `slugify` plus a numeric suffix if the author already used that slug.
 *
 * Slugs are unique per author, not globally: two people may both publish
 * `/learning-rust`, and they are different URLs because the handle is in the path.
 */
export function uniqueSlug(title: string | null | undefined, taken: Iterable<string>): string {
  const base = slugify(title);
  const used = new Set(taken);
  if (!used.has(base)) return base;

  for (let suffix = 2; ; suffix++) {
    const candidate = `${base}-${suffix}`;
    if (!used.has(candidate)) return candidate;
  }
}

/** The canonical public address of a published thread. */
export const WEB_ORIGIN = 'https://dailynote.app';

export function publicUrl(handle: string, slug: string): string {
  return `${WEB_ORIGIN}/@${handle}/${slug}`;
}

// --- publishing -------------------------------------------------------------

/**
 * Why this note cannot be made public, or null if it can.
 *
 * `localOnly` is the privacy pressure valve ADR 0002 bought, so it is checked
 * here *and* by a database constraint. A note marked local never leaves the
 * device, and no code path may make that a lie.
 */
export function publishError(note: Note): string | null {
  if (note.localOnly) return 'This note is marked local-only.';
  if (note.deleted) return 'This note is in Recently deleted.';
  if (note.kind === 'update') return 'Publish the thread, not one update.';
  if (note.locked) return 'Unlock this note first.';
  if (note.body.trim().length === 0) return 'There is nothing in it yet.';
  return null;
}

export function canPublish(note: Note): boolean {
  return publishError(note) === null;
}

/** The patch that makes a private note public. Publishing is never in-place editing. */
export function publishPatch(now: Date): Pick<Note, 'visibility' | 'publishedAt'> {
  return { visibility: 'public', publishedAt: now.toISOString() };
}

/**
 * The patch that takes it back.
 *
 * `publishedAt` is cleared rather than kept as history: the DB constraint
 * `private_is_unpublished` requires it, and a private note that remembers when
 * it was briefly public is a record nobody asked us to keep.
 */
export function unpublishPatch(): Pick<Note, 'visibility' | 'publishedAt'> {
  return { visibility: 'private', publishedAt: null };
}

// --- the feed ---------------------------------------------------------------

/**
 * One published thread, flattened for rendering.
 *
 * The author's details are denormalized onto it because a feed row draws a name
 * and an avatar, and making every row join back to a profile is the difference
 * between one query and fifty.
 */
export interface FeedItem {
  /** The root note's id. A thread is addressed by its root, always. */
  id: string;
  authorId: string;
  handle: string;
  displayName: string | null;
  avatarUrl: string | null;
  slug: string;

  /**
   * True for a post written straight to the feed, false for a private note the
   * author later chose to share. The feed says which, because they are
   * different acts and readers can tell anyway.
   */
  bornPublic: boolean;

  title: string | null;
  body: string;
  doc: string | null;

  publishedAt: Timestamp;
  /**
   * The last thing that happened to the thread: published, an update added, or
   * completed. This -- not creation -- is what the feed sorts on, because the
   * whole thesis is that a six-week-old thread coming back with "done" is the
   * interesting event.
   */
  activeAt: Timestamp;
  completedAt: Timestamp | null;
  updateCount: number;

  likeCount: number;
  likedByMe: boolean;
  viewCount: number;
}

/** What the thread most recently did, for the one-line label above a feed row. */
export type FeedEvent = 'posted' | 'shared' | 'updated' | 'followed-through';

export function feedEvent(item: FeedItem): FeedEvent {
  if (item.completedAt !== null && item.completedAt === item.activeAt) return 'followed-through';
  if (item.updateCount > 0 && item.activeAt !== item.publishedAt) return 'updated';
  return item.bornPublic ? 'posted' : 'shared';
}

export function feedEventLabel(event: FeedEvent): string {
  switch (event) {
    case 'posted':
      return 'posted';
    case 'shared':
      return 'shared a note';
    case 'updated':
      return 'added an update';
    case 'followed-through':
      return 'followed through';
  }
}

export interface FeedOptions {
  /** Author ids whose items belong in the feed. Omit for "everyone". */
  following?: ReadonlySet<string> | undefined;
  /** Author ids the reader blocked, and readers who blocked them. Always applied. */
  blocked?: ReadonlySet<string> | undefined;
  /** The reader's own id, so their own posts appear in their following feed. */
  selfId?: string | null | undefined;
}

/**
 * The feed, composed.
 *
 * Reverse chronological on `activeAt` and nothing else -- decision 2 in
 * plan-rollout-2, and the one decision most worth not revisiting. There is no
 * score, no engagement weighting and no place to add one; the ordering is a
 * single comparator so that staying honest stays easy.
 */
export function composeFeed(items: readonly FeedItem[], options: FeedOptions = {}): FeedItem[] {
  const { following, blocked, selfId } = options;

  return items
    .filter((item) => {
      if (blocked?.has(item.authorId) === true) return false;
      if (following === undefined) return true;
      return item.authorId === selfId || following.has(item.authorId);
    })
    .slice()
    .sort((a, b) => {
      const order = b.activeAt.localeCompare(a.activeAt);
      // Ties are broken by id so the order never shifts between reads; two
      // items published in the same millisecond otherwise swap places on
      // every refresh, which reads as the list glitching.
      return order !== 0 ? order : a.id.localeCompare(b.id);
    });
}

/** The blocked set is symmetric: a block hides you from them as well. */
export function blockedIds(
  blocks: readonly { blockerId: string; blockedId: string }[],
  selfId: string,
): Set<string> {
  const ids = new Set<string>();
  for (const block of blocks) {
    if (block.blockerId === selfId) ids.add(block.blockedId);
    if (block.blockedId === selfId) ids.add(block.blockerId);
  }
  return ids;
}

// --- reading ----------------------------------------------------------------

/** The first line, which the list already renders as the title. */
export function feedTitle(item: FeedItem): string {
  const title = item.title?.trim() ?? '';
  return title.length > 0 ? title : 'Untitled';
}

/**
 * The body minus its title line, flattened to one line for a feed row.
 *
 * Mirrors the notes list's preview so a shared note looks in the feed like it
 * looks at home.
 */
export function feedPreview(item: FeedItem): string {
  return item.body
    .split('\n')
    .slice(1)
    .map((line) => line.replace(/^- /, ''))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export const REPORT_REASONS = [
  'Spam',
  'Harassment or hate',
  'Violence or self-harm',
  'Sexual content',
  'Impersonation',
  'Something else',
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number];
