import { describe, expect, it } from 'vitest';
import { deriveTitle } from './title';

describe('deriveTitle', () => {
  it('uses the first line', () => {
    expect(deriveTitle('Call the dentist\nabout the crown')).toBe('Call the dentist');
  });

  it('skips leading blank lines', () => {
    expect(deriveTitle('\n\n  \nActual content')).toBe('Actual content');
  });

  it('returns null for an empty note', () => {
    expect(deriveTitle('')).toBeNull();
  });

  it('returns null for a whitespace-only note', () => {
    expect(deriveTitle('   \n\t\n  ')).toBeNull();
  });

  it('strips markdown heading markers', () => {
    expect(deriveTitle('## Weekly review')).toBe('Weekly review');
  });

  it('strips bullet and checkbox markers', () => {
    expect(deriveTitle('- [ ] buy milk')).toBe('buy milk');
    expect(deriveTitle('* a bullet')).toBe('a bullet');
    expect(deriveTitle('1. first item')).toBe('first item');
    expect(deriveTitle('> a quote')).toBe('a quote');
  });

  it('skips a line that is only markup', () => {
    expect(deriveTitle('## \nreal content')).toBe('real content');
  });

  it('strips hashtags so a tagged note titles cleanly', () => {
    expect(deriveTitle('#do call the dentist')).toBe('call the dentist');
  });

  it('collapses runs of whitespace', () => {
    expect(deriveTitle('too    many\t\tspaces')).toBe('too many spaces');
  });

  it('truncates on a word boundary with an ellipsis', () => {
    const body = 'The quick brown fox jumps over the lazy dog and keeps on going forever';
    const title = deriveTitle(body, 30);
    expect(title).toBe('The quick brown fox jumps…');
    expect(title!.length).toBeLessThanOrEqual(31);
  });

  it('truncates mid-word when there is no usable word boundary', () => {
    const title = deriveTitle('Supercalifragilisticexpialidocious', 20);
    expect(title).toBe('Supercalifragilistic…');
  });

  it('does not truncate a title that exactly fits', () => {
    expect(deriveTitle('12345', 5)).toBe('12345');
  });

  it('returns null when the note is only a hashtag', () => {
    expect(deriveTitle('#do')).toBeNull();
  });
});
