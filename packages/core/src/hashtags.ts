/**
 * Tags come from inline `#hashtags` parsed out of the body. There is no tag UI
 * and no tag picker -- it matches how people already write in notes apps.
 */

/** Writing this tag in a note promotes it to a commitment. */
export const COMMITMENT_TAG = 'do';

/**
 * A tag is `#` then a letter, then letters/digits/underscore/hyphen.
 *
 * Deliberately no lookbehind: Hermes' regex support for it is inconsistent, so
 * the preceding character is checked by hand in `parseHashtags` instead.
 */
const HASHTAG = /#[\p{L}][\p{L}\p{N}_-]*/gu;

/** Characters that, immediately before a `#`, mean it is not a tag. */
const NOT_A_BOUNDARY = /[\p{L}\p{N}_/#]/u;

/**
 * Extracts hashtags from a note body, lowercased and de-duplicated, in order of
 * first appearance. The `#` is not included in the returned names.
 *
 * Skips things that look like tags but aren't:
 * - URL fragments (`example.com/#section`) -- preceded by `/`
 * - mid-word hashes (`C#`, `issue#42`) -- preceded by a letter or digit
 * - markdown headings (`# Heading`) -- a space follows the `#`
 */
export function parseHashtags(body: string): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];

  for (const match of body.matchAll(HASHTAG)) {
    const start = match.index;
    const before = start > 0 ? body[start - 1] : undefined;
    if (before !== undefined && NOT_A_BOUNDARY.test(before)) continue;

    const name = match[0].slice(1).toLowerCase();
    if (seen.has(name)) continue;
    seen.add(name);
    tags.push(name);
  }

  return tags;
}

/** True when the body carries the `#do` tag that promotes it to a commitment. */
export function hasCommitmentTag(body: string): boolean {
  return parseHashtags(body).includes(COMMITMENT_TAG);
}

/**
 * Removes hashtags from a string. Used for title derivation so a note that is
 * just `#do call the dentist` titles as "call the dentist" rather than
 * "#do call the dentist".
 */
export function stripHashtags(body: string): string {
  let out = '';
  let cursor = 0;

  for (const match of body.matchAll(HASHTAG)) {
    const start = match.index;
    const before = start > 0 ? body[start - 1] : undefined;
    if (before !== undefined && NOT_A_BOUNDARY.test(before)) continue;

    out += body.slice(cursor, start);
    cursor = start + match[0].length;
  }

  return out + body.slice(cursor);
}
