import { describe, expect, it } from 'vitest';
import {
  blockedIds,
  canPublish,
  composeFeed,
  feedEvent,
  feedPreview,
  handleError,
  normalizeHandle,
  profileName,
  publicUrl,
  publishError,
  publishPatch,
  slugify,
  uniqueSlug,
  unpublishPatch,
  type FeedItem,
  type Profile,
} from './social';
import { makeNote } from './test-support';

function makeItem(overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    id: 'item-1',
    authorId: 'author-1',
    handle: 'alex',
    displayName: null,
    avatarUrl: null,
    slug: 'a-thread',
    bornPublic: false,
    title: 'A thread',
    body: 'A thread\nthe rest of it',
    doc: null,
    publishedAt: '2026-01-01T09:00:00.000Z',
    activeAt: '2026-01-01T09:00:00.000Z',
    completedAt: null,
    updateCount: 0,
    likeCount: 0,
    likedByMe: false,
    viewCount: 0,
    ...overrides,
  };
}

function makeProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: 'author-1',
    handle: 'alex',
    displayName: null,
    bio: null,
    avatarUrl: null,
    createdAt: '2026-01-01T09:00:00.000Z',
    ...overrides,
  };
}

describe('normalizeHandle', () => {
  it('strips the @ and lowercases', () => {
    expect(normalizeHandle('  @Alex_B  ')).toBe('alex_b');
  });

  it('strips a doubled @, which autocorrect produces', () => {
    expect(normalizeHandle('@@alex')).toBe('alex');
  });
});

describe('handleError', () => {
  it('accepts a plain handle', () => {
    expect(handleError('alex_99')).toBeNull();
  });

  it('rejects one that is too short', () => {
    expect(handleError('al')).toMatch(/at least/i);
  });

  it('rejects one that is too long', () => {
    expect(handleError('a'.repeat(31))).toMatch(/at most/i);
  });

  it('rejects punctuation and spaces', () => {
    expect(handleError('alex.b')).toMatch(/letters/i);
    expect(handleError('alex b')).toMatch(/letters/i);
  });

  it('rejects reserved names, including the ones the web surface needs', () => {
    expect(handleError('admin')).toMatch(/reserved/i);
    expect(handleError('@Support')).toMatch(/reserved/i);
    expect(handleError('terms')).toMatch(/reserved/i);
  });
});

describe('profileName', () => {
  it('prefers the display name', () => {
    expect(profileName(makeProfile({ displayName: 'Alex' }))).toBe('Alex');
  });

  it('falls back to the handle when the display name is blank', () => {
    expect(profileName(makeProfile({ displayName: '   ' }))).toBe('@alex');
  });
});

describe('slugify', () => {
  it('makes a title into a path segment', () => {
    expect(slugify('Learning Rust, week 3!')).toBe('learning-rust-week-3');
  });

  it('folds accents rather than dropping the word', () => {
    expect(slugify('Café notes')).toBe('cafe-notes');
  });

  it('falls back when nothing survives', () => {
    expect(slugify('!!!')).toBe('note');
    expect(slugify(null)).toBe('note');
  });

  it('never ends in a hyphen after truncation', () => {
    const slug = slugify(`${'a'.repeat(59)} tail`);
    expect(slug.endsWith('-')).toBe(false);
    expect(slug.length).toBeLessThanOrEqual(60);
  });
});

describe('uniqueSlug', () => {
  it('leaves a free slug alone', () => {
    expect(uniqueSlug('Learning Rust', [])).toBe('learning-rust');
  });

  it('suffixes past the ones this author already used', () => {
    expect(uniqueSlug('Learning Rust', ['learning-rust', 'learning-rust-2'])).toBe(
      'learning-rust-3',
    );
  });
});

describe('publicUrl', () => {
  it('is the handle and slug under the web origin', () => {
    expect(publicUrl('alex', 'learning-rust')).toBe('https://dailynote.app/@alex/learning-rust');
  });
});

describe('publishError', () => {
  it('allows an ordinary note', () => {
    expect(canPublish(makeNote({ body: 'something worth sharing' }))).toBe(true);
  });

  it('refuses a local-only note, which is the whole point of the flag', () => {
    expect(publishError(makeNote({ localOnly: true }))).toMatch(/local/i);
  });

  it('refuses a deleted note', () => {
    expect(publishError(makeNote({ deleted: true }))).toMatch(/deleted/i);
  });

  it('refuses a locked note', () => {
    expect(publishError(makeNote({ locked: true }))).toMatch(/unlock/i);
  });

  it('refuses an update: the thread is the published unit', () => {
    expect(publishError(makeNote({ kind: 'update' }))).toMatch(/thread/i);
  });

  it('refuses an empty note', () => {
    expect(publishError(makeNote({ body: '   \n  ' }))).toMatch(/nothing/i);
  });
});

describe('publishPatch / unpublishPatch', () => {
  it('publishing sets both fields together', () => {
    expect(publishPatch(new Date('2026-02-01T10:00:00.000Z'))).toEqual({
      visibility: 'public',
      publishedAt: '2026-02-01T10:00:00.000Z',
    });
  });

  it('unpublishing clears the timestamp, satisfying private_is_unpublished', () => {
    expect(unpublishPatch()).toEqual({ visibility: 'private', publishedAt: null });
  });
});

describe('composeFeed', () => {
  it('is reverse chronological on activity, not on publication', () => {
    const old = makeItem({
      id: 'a',
      publishedAt: '2026-01-01T09:00:00.000Z',
      activeAt: '2026-03-01T09:00:00.000Z',
      updateCount: 1,
    });
    const recent = makeItem({
      id: 'b',
      publishedAt: '2026-02-01T09:00:00.000Z',
      activeAt: '2026-02-01T09:00:00.000Z',
    });

    expect(composeFeed([recent, old]).map((item) => item.id)).toEqual(['a', 'b']);
  });

  it('breaks ties by id so the order is stable between reads', () => {
    const first = makeItem({ id: 'a' });
    const second = makeItem({ id: 'b' });
    expect(composeFeed([second, first]).map((item) => item.id)).toEqual(['a', 'b']);
  });

  it('shows everyone when no following set is given', () => {
    const items = [makeItem({ id: 'a', authorId: 'x' }), makeItem({ id: 'b', authorId: 'y' })];
    expect(composeFeed(items)).toHaveLength(2);
  });

  it('restricts to the people you follow when one is', () => {
    const items = [makeItem({ id: 'a', authorId: 'x' }), makeItem({ id: 'b', authorId: 'y' })];
    const feed = composeFeed(items, { following: new Set(['y']) });
    expect(feed.map((item) => item.id)).toEqual(['b']);
  });

  it('keeps your own items in your following feed without following yourself', () => {
    const items = [makeItem({ id: 'a', authorId: 'me' }), makeItem({ id: 'b', authorId: 'y' })];
    const feed = composeFeed(items, { following: new Set(['y']), selfId: 'me' });
    expect(feed.map((item) => item.id).sort()).toEqual(['a', 'b']);
  });

  it('drops blocked authors even when you follow them', () => {
    const items = [makeItem({ id: 'a', authorId: 'x' })];
    const feed = composeFeed(items, { following: new Set(['x']), blocked: new Set(['x']) });
    expect(feed).toEqual([]);
  });
});

describe('blockedIds', () => {
  it('is symmetric: blocking hides you from them too', () => {
    const blocks = [
      { blockerId: 'me', blockedId: 'them' },
      { blockerId: 'other', blockedId: 'me' },
    ];
    expect(blockedIds(blocks, 'me')).toEqual(new Set(['them', 'other']));
  });

  it('ignores blocks between other people', () => {
    expect(blockedIds([{ blockerId: 'a', blockedId: 'b' }], 'me').size).toBe(0);
  });
});

describe('feedEvent', () => {
  it('calls a born-public item a post', () => {
    expect(feedEvent(makeItem({ bornPublic: true }))).toBe('posted');
  });

  it('calls a published private note a share', () => {
    expect(feedEvent(makeItem({ bornPublic: false }))).toBe('shared');
  });

  it('calls a thread that gained an update an update', () => {
    const item = makeItem({ updateCount: 1, activeAt: '2026-03-01T09:00:00.000Z' });
    expect(feedEvent(item)).toBe('updated');
  });

  it('calls a completion follow-through, which is the point of the feed', () => {
    const item = makeItem({
      updateCount: 1,
      completedAt: '2026-03-01T09:00:00.000Z',
      activeAt: '2026-03-01T09:00:00.000Z',
    });
    expect(feedEvent(item)).toBe('followed-through');
  });
});

describe('feedPreview', () => {
  it('drops the title line and flattens the rest', () => {
    const item = makeItem({ body: 'Title\n- one\n- two' });
    expect(feedPreview(item)).toBe('one two');
  });
});
