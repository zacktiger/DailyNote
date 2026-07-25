import { describe, expect, it } from 'vitest';
import { createNote, editBody, isSyncable, threadOf } from './note';
import { makeNote } from './test-support';

const NOW = new Date('2026-07-26T09:00:00.000Z');

describe('createNote', () => {
  it('defaults a new note to a private root of its own thread', () => {
    const note = createNote({ id: 'abc', body: 'Hello' }, NOW);
    expect(note.rootId).toBe('abc');
    expect(note.parentId).toBeNull();
    expect(note.kind).toBe('note');
    expect(note.visibility).toBe('private');
    expect(note.publishedAt).toBeNull();
    expect(note.localOnly).toBe(false);
    expect(note.deleted).toBe(false);
    expect(note.source).toBe('composer');
  });

  it('caches the derived title', () => {
    expect(createNote({ id: 'abc', body: '# Weekly review\nnotes' }, NOW).title).toBe('Weekly review');
  });

  it('is not a commitment until promoted', () => {
    const note = createNote({ id: 'abc', body: 'Hello' }, NOW);
    expect(note.nextReviewAt).toBeNull();
    expect(note.reviewInterval).toBeNull();
    expect(note.reviewCount).toBe(0);
  });

  it('records provenance for captured notes', () => {
    const note = createNote(
      { id: 'abc', body: 'link', source: 'share', sourceRef: 'https://example.com' },
      NOW,
    );
    expect(note.source).toBe('share');
    expect(note.sourceRef).toBe('https://example.com');
  });

  it('attaches an update to an existing thread', () => {
    const note = createNote(
      { id: 'child', body: 'progress', rootId: 'root', parentId: 'root', kind: 'update' },
      NOW,
    );
    expect(note.rootId).toBe('root');
    expect(note.kind).toBe('update');
  });

  it('stamps createdAt and updatedAt identically', () => {
    const note = createNote({ id: 'abc', body: 'Hello' }, NOW);
    expect(note.createdAt).toBe(NOW.toISOString());
    expect(note.updatedAt).toBe(note.createdAt);
  });
});

describe('editBody', () => {
  it('updates body, title and updatedAt together', () => {
    const note = makeNote({ body: 'Old title\nrest' });
    const edited = editBody(note, 'New title\nrest', NOW);
    expect(edited.body).toBe('New title\nrest');
    expect(edited.title).toBe('New title');
    expect(edited.updatedAt).toBe(NOW.toISOString());
    expect(edited.createdAt).toBe(note.createdAt);
  });
});

describe('threadOf', () => {
  it('returns the root and its updates oldest first', () => {
    const notes = [
      makeNote({ id: 'u2', rootId: 'root', kind: 'update', createdAt: '2026-03-01T09:00:00.000Z' }),
      makeNote({ id: 'root', rootId: 'root', createdAt: '2026-01-01T09:00:00.000Z' }),
      makeNote({ id: 'u1', rootId: 'root', kind: 'update', createdAt: '2026-02-01T09:00:00.000Z' }),
      makeNote({ id: 'other', rootId: 'other' }),
    ];
    expect(threadOf(notes, 'root').map((n) => n.id)).toEqual(['root', 'u1', 'u2']);
  });

  it('omits deleted notes', () => {
    const notes = [
      makeNote({ id: 'root', rootId: 'root' }),
      makeNote({ id: 'gone', rootId: 'root', kind: 'update', deleted: true }),
    ];
    expect(threadOf(notes, 'root').map((n) => n.id)).toEqual(['root']);
  });

  it('returns an empty array for an unknown thread', () => {
    expect(threadOf([makeNote({ id: 'a', rootId: 'a' })], 'nope')).toEqual([]);
  });
});

describe('isSyncable', () => {
  it('excludes local-only notes from the outbound set', () => {
    expect(isSyncable(makeNote({ localOnly: true }))).toBe(false);
    expect(isSyncable(makeNote({ localOnly: false }))).toBe(true);
  });
});
