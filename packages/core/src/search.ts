import { parseHashtags } from './hashtags';
import type { Note } from './types';

/**
 * Search ranking.
 *
 * Per the plan (section 0.2, option A) this is a JS filter over an in-memory
 * array rather than SQLite FTS5. That is fine to roughly 10-20k notes; the
 * whole read surface is small enough that swapping in FTS5 later means changing
 * this one function.
 */

export interface SearchResult {
  note: Note;
  score: number;
}

export interface SearchOptions {
  /** Include archived notes. Default false. */
  includeArchived?: boolean;
  /** Include completed commitments. Default true -- finished work is findable. */
  includeCompleted?: boolean;
  /** Only notes carrying this tag (lowercase, without `#`). */
  tag?: string;
  limit?: number;
}

const WEIGHT = {
  titleExact: 40,
  titlePrefix: 20,
  title: 12,
  tag: 15,
  body: 4,
} as const;

/** Recency can only break ties -- it is always worth less than one body hit. */
const MAX_RECENCY_BONUS = 1;
const RECENCY_HALF_LIFE_DAYS = 30;

export function searchNotes(
  notes: readonly Note[],
  query: string,
  options: SearchOptions = {},
): SearchResult[] {
  const { includeArchived = false, includeCompleted = true, tag, limit } = options;

  const candidates = notes.filter((note) => {
    if (note.deleted) return false;
    if (!includeArchived && note.archivedAt !== null) return false;
    if (!includeCompleted && note.completedAt !== null) return false;
    if (tag !== undefined && !parseHashtags(note.body).includes(tag.toLowerCase())) return false;
    return true;
  });

  const tokens = tokenize(query);

  // An empty query is a browse, not a search: everything, newest first.
  if (tokens.length === 0) {
    const browsed = [...candidates].sort(byUpdatedAtDesc).map((note) => ({ note, score: 0 }));
    return limit === undefined ? browsed : browsed.slice(0, limit);
  }

  const results: SearchResult[] = [];
  const now = Date.now();

  for (const note of candidates) {
    const score = scoreNote(note, tokens, now);
    if (score > 0) results.push({ note, score });
  }

  results.sort((a, b) => b.score - a.score || byUpdatedAtDesc(a.note, b.note));
  return limit === undefined ? results : results.slice(0, limit);
}

/**
 * All tokens must match somewhere (AND semantics) -- with short queries over
 * personal notes, OR returns the whole corpus and is useless.
 */
function scoreNote(note: Note, tokens: readonly string[], now: number): number {
  const title = (note.title ?? '').toLowerCase();
  const body = note.body.toLowerCase();
  const tags = parseHashtags(note.body);

  let total = 0;

  for (const token of tokens) {
    let best = 0;

    if (title === token) best = WEIGHT.titleExact;
    else if (title.startsWith(token)) best = WEIGHT.titlePrefix;
    else if (title.includes(token)) best = WEIGHT.title;

    if (tags.some((name) => name === token || name.startsWith(token))) {
      best = Math.max(best, WEIGHT.tag);
    }

    if (best === 0 && body.includes(token)) best = WEIGHT.body;

    // One token missed: the note is not a match at all.
    if (best === 0) return 0;
    total += best;
  }

  return total + recencyBonus(note, now);
}

function recencyBonus(note: Note, now: number): number {
  const ageDays = (now - new Date(note.updatedAt).getTime()) / 86_400_000;
  if (!Number.isFinite(ageDays) || ageDays < 0) return MAX_RECENCY_BONUS;
  return MAX_RECENCY_BONUS * Math.pow(0.5, ageDays / RECENCY_HALF_LIFE_DAYS);
}

export function tokenize(query: string): string[] {
  return query
    .toLowerCase()
    .split(/\s+/)
    .map((token) => token.replace(/^#/, '').trim())
    .filter((token) => token.length > 0);
}

function byUpdatedAtDesc(a: Note, b: Note): number {
  return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
}
