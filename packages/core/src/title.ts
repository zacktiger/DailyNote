import { stripHashtags } from './hashtags';

export const DEFAULT_TITLE_LENGTH = 80;

/** Markdown noise to shave off the front of the first line. */
const LEADING_MARKUP = /^\s*(?:#{1,6}\s+|[-*+]\s+(?:\[[ xX]\]\s*)?|>\s+|\d+[.)]\s+)/;

/**
 * Derives a display title from the first line with content.
 *
 * Returns null for an empty note, which the UI renders as "Untitled" -- the
 * distinction matters because a null title is also how the list view knows a
 * note is still a blank draft.
 */
export function deriveTitle(body: string, maxLength: number = DEFAULT_TITLE_LENGTH): string | null {
  for (const rawLine of body.split('\n')) {
    // Strip markup first: a line that is only `## ` is still empty.
    const line = collapse(stripHashtags(rawLine.replace(LEADING_MARKUP, '')));
    if (line.length === 0) continue;
    return truncate(line, maxLength);
  }
  return null;
}

function collapse(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

/** Truncates on a word boundary where one is close enough, else mid-word. */
function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;

  const clipped = value.slice(0, maxLength);
  const lastSpace = clipped.lastIndexOf(' ');
  // Only respect the word boundary if it isn't gutting the title.
  const cut = lastSpace > maxLength * 0.6 ? clipped.slice(0, lastSpace) : clipped;

  return cut.trimEnd() + '…';
}
