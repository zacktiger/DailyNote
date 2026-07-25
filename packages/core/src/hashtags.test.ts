import { describe, expect, it } from 'vitest';
import { hasCommitmentTag, parseHashtags, stripHashtags } from './hashtags';

describe('parseHashtags', () => {
  it('pulls tags out of a body', () => {
    expect(parseHashtags('call the dentist #health #do')).toEqual(['health', 'do']);
  });

  it('lowercases and de-duplicates, keeping first-appearance order', () => {
    expect(parseHashtags('#Work notes about #work and #Ideas')).toEqual(['work', 'ideas']);
  });

  it('matches a tag at the very start of the body', () => {
    expect(parseHashtags('#do ship the thing')).toEqual(['do']);
  });

  it('handles adjacent tags separated by a single space', () => {
    expect(parseHashtags('#a #b #c')).toEqual(['a', 'b', 'c']);
  });

  it('allows underscores and hyphens inside a tag', () => {
    expect(parseHashtags('#side-project #deep_work')).toEqual(['side-project', 'deep_work']);
  });

  it('stops a tag at punctuation', () => {
    expect(parseHashtags('remember #groceries, then #laundry.')).toEqual(['groceries', 'laundry']);
  });

  it('supports non-ASCII tags', () => {
    expect(parseHashtags('#café #日本語')).toEqual(['café', '日本語']);
  });

  it('ignores markdown headings', () => {
    expect(parseHashtags('# Heading\n## Subheading\nbody')).toEqual([]);
  });

  it('ignores URL fragments', () => {
    expect(parseHashtags('see https://example.com/docs#installation')).toEqual([]);
  });

  it('ignores mid-word hashes', () => {
    expect(parseHashtags('learning C# and closing issue#42')).toEqual([]);
  });

  it('ignores a bare hash and a hash followed by a digit', () => {
    expect(parseHashtags('# ## #1 #')).toEqual([]);
  });

  it('returns an empty array for an empty body', () => {
    expect(parseHashtags('')).toEqual([]);
  });

  it('finds tags across multiple lines', () => {
    expect(parseHashtags('first line #one\nsecond line #two')).toEqual(['one', 'two']);
  });
});

describe('hasCommitmentTag', () => {
  it('detects #do', () => {
    expect(hasCommitmentTag('email Sam back #do')).toBe(true);
  });

  it('is case insensitive', () => {
    expect(hasCommitmentTag('#DO email Sam')).toBe(true);
  });

  it('does not fire on a tag that merely starts with do', () => {
    expect(hasCommitmentTag('#done and dusted')).toBe(false);
  });

  it('is false when there are no tags', () => {
    expect(hasCommitmentTag('just a thought')).toBe(false);
  });
});

describe('stripHashtags', () => {
  it('removes tags but keeps surrounding text', () => {
    expect(stripHashtags('#do call the dentist #health').trim()).toBe('call the dentist');
  });

  it('leaves headings and URLs alone', () => {
    const input = '# Heading with https://example.com/a#b';
    expect(stripHashtags(input)).toBe(input);
  });

  it('is a no-op on text without tags', () => {
    expect(stripHashtags('plain text')).toBe('plain text');
  });
});
