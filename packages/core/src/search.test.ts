import { describe, expect, it } from 'vitest';
import { searchNotes, tokenize } from './search';
import { makeNote } from './test-support';

const ids = (results: { note: { id: string } }[]) => results.map((r) => r.note.id);

describe('tokenize', () => {
  it('lowercases and splits on whitespace', () => {
    expect(tokenize('Dentist   Appointment')).toEqual(['dentist', 'appointment']);
  });

  it('strips a leading hash so #work and work search alike', () => {
    expect(tokenize('#work')).toEqual(['work']);
  });

  it('returns an empty array for a blank query', () => {
    expect(tokenize('   ')).toEqual([]);
  });
});

describe('searchNotes', () => {
  const notes = [
    makeNote({ id: 'title-hit', body: 'Dentist appointment\nbook the crown fitting' }),
    makeNote({ id: 'body-hit', body: 'Random thoughts\nremember the dentist thing' }),
    makeNote({ id: 'tag-hit', body: 'Crown fitting notes #dentist' }),
    makeNote({ id: 'miss', body: 'Completely unrelated' }),
  ];

  it('ranks a title match above a body match', () => {
    const results = searchNotes(notes, 'dentist');
    expect(ids(results)[0]).toBe('title-hit');
    expect(ids(results)).toContain('body-hit');
    expect(ids(results)).not.toContain('miss');
  });

  it('ranks a tag match above a body match', () => {
    const results = searchNotes(notes, 'dentist');
    expect(ids(results).indexOf('tag-hit')).toBeLessThan(ids(results).indexOf('body-hit'));
  });

  it('requires every token to match (AND semantics)', () => {
    // Order is asserted by the ranking tests; here only membership matters.
    expect(ids(searchNotes(notes, 'dentist crown')).sort()).toEqual(['tag-hit', 'title-hit']);
    expect(searchNotes(notes, 'dentist banana')).toEqual([]);
  });

  it('is case insensitive', () => {
    expect(ids(searchNotes(notes, 'DENTIST'))).toContain('title-hit');
  });

  it('returns everything newest-first for an empty query', () => {
    const corpus = [
      makeNote({ id: 'older', updatedAt: '2026-01-01T09:00:00.000Z' }),
      makeNote({ id: 'newer', updatedAt: '2026-06-01T09:00:00.000Z' }),
    ];
    expect(ids(searchNotes(corpus, ''))).toEqual(['newer', 'older']);
  });

  it('never lets recency outrank a content match', () => {
    const corpus = [
      makeNote({ id: 'stale-title', body: 'Dentist', updatedAt: '2020-01-01T09:00:00.000Z' }),
      makeNote({ id: 'fresh-body', body: 'x\nsomething dentist related', updatedAt: new Date().toISOString() }),
    ];
    expect(ids(searchNotes(corpus, 'dentist'))[0]).toBe('stale-title');
  });

  it('excludes deleted notes', () => {
    const corpus = [makeNote({ id: 'gone', body: 'Dentist', deleted: true })];
    expect(searchNotes(corpus, 'dentist')).toEqual([]);
  });

  it('excludes archived notes unless asked', () => {
    const corpus = [makeNote({ id: 'archived', body: 'Dentist', archivedAt: '2026-02-01T09:00:00.000Z' })];
    expect(searchNotes(corpus, 'dentist')).toEqual([]);
    expect(ids(searchNotes(corpus, 'dentist', { includeArchived: true }))).toEqual(['archived']);
  });

  it('includes completed notes by default and excludes them on request', () => {
    const corpus = [makeNote({ id: 'done', body: 'Dentist', completedAt: '2026-02-01T09:00:00.000Z' })];
    expect(ids(searchNotes(corpus, 'dentist'))).toEqual(['done']);
    expect(searchNotes(corpus, 'dentist', { includeCompleted: false })).toEqual([]);
  });

  it('filters by tag', () => {
    expect(ids(searchNotes(notes, 'crown', { tag: 'dentist' }))).toEqual(['tag-hit']);
  });

  it('combines a tag filter with an empty query as a browse', () => {
    expect(ids(searchNotes(notes, '', { tag: 'dentist' }))).toEqual(['tag-hit']);
  });

  it('respects the limit', () => {
    expect(searchNotes(notes, 'dentist', { limit: 1 })).toHaveLength(1);
    expect(searchNotes(notes, '', { limit: 2 })).toHaveLength(2);
  });

  it('matches a tag by prefix', () => {
    expect(ids(searchNotes(notes, 'dent', { tag: 'dentist' }))).toEqual(['tag-hit']);
  });

  it('returns an empty array for an empty corpus', () => {
    expect(searchNotes([], 'anything')).toEqual([]);
  });
});
