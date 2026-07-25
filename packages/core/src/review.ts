import type { Note, Timestamp } from './types';

/**
 * The follow-through loop.
 *
 * Loose spaced repetition, not SM-2. The cadence is deliberately coarse because
 * the goal is "this comes back at a plausible moment", not retention modelling.
 *
 * Design constraint from the plan: guilt is the failure mode. There are no due
 * dates, no overdue badges and no streaks -- "not yet" is a first-class answer
 * that costs the user nothing.
 */

export const DEFAULT_REVIEW_LADDER: readonly number[] = [2, 7, 21, 60];

export const MS_PER_DAY = 86_400_000;

export type ReviewAnswer = 'not_yet' | 'add_update' | 'done' | 'let_go';

/**
 * A pure description of what a review does. The caller applies `patch` to the
 * reviewed note and, when `createsUpdate` is true, inserts a child note in the
 * same thread.
 */
export interface ReviewResult {
  patch: Pick<
    Note,
    'nextReviewAt' | 'reviewInterval' | 'reviewCount' | 'completedAt' | 'archivedAt' | 'updatedAt'
  >;
  createsUpdate: boolean;
}

/** Adds whole days to an instant, preserving the clock time. */
export function addDays(from: Timestamp | Date, days: number): Timestamp {
  const base = from instanceof Date ? from : new Date(from);
  return new Date(base.getTime() + days * MS_PER_DAY).toISOString();
}

/**
 * The next rung on the ladder.
 *
 * The last rung repeats forever rather than terminating: a commitment you keep
 * saying "not yet" to should keep coming back every 60 days, not silently stop.
 * Closing a thread is always an explicit choice ("done" or "let go").
 */
export function nextInterval(
  current: number | null | undefined,
  ladder: readonly number[] = DEFAULT_REVIEW_LADDER,
): number {
  const rungs = ladder.length > 0 ? ladder : DEFAULT_REVIEW_LADDER;
  const first = rungs[0]!;
  const last = rungs[rungs.length - 1]!;

  if (current == null) return first;
  return rungs.find((days) => days > current) ?? last;
}

/**
 * Promotes a note to a commitment: it now has a `next_review_at` and will come
 * back. Idempotent -- promoting an existing commitment does not reset it.
 */
export function promoteToCommitment(
  note: Pick<Note, 'nextReviewAt' | 'reviewInterval' | 'reviewCount'>,
  now: Date,
  ladder: readonly number[] = DEFAULT_REVIEW_LADDER,
): Pick<Note, 'nextReviewAt' | 'reviewInterval' | 'reviewCount' | 'updatedAt'> {
  if (note.nextReviewAt !== null) {
    return {
      nextReviewAt: note.nextReviewAt,
      reviewInterval: note.reviewInterval,
      reviewCount: note.reviewCount,
      updatedAt: now.toISOString(),
    };
  }

  const interval = nextInterval(null, ladder);
  return {
    nextReviewAt: addDays(now, interval),
    reviewInterval: interval,
    reviewCount: note.reviewCount,
    updatedAt: now.toISOString(),
  };
}

/** Demotes a commitment back to an ordinary note without archiving it. */
export function clearCommitment(
  now: Date,
): Pick<Note, 'nextReviewAt' | 'reviewInterval' | 'updatedAt'> {
  return {
    nextReviewAt: null,
    reviewInterval: null,
    updatedAt: now.toISOString(),
  };
}

/**
 * Applies one of the four answers to the review card.
 *
 * - `not_yet`    advance the interval, no guilt
 * - `add_update` advance the interval *and* create a child note in the thread
 * - `done`       close the thread
 * - `let_go`     archive it
 */
export function applyReview(
  note: Pick<Note, 'nextReviewAt' | 'reviewInterval' | 'reviewCount'>,
  answer: ReviewAnswer,
  now: Date,
  ladder: readonly number[] = DEFAULT_REVIEW_LADDER,
): ReviewResult {
  const updatedAt = now.toISOString();

  switch (answer) {
    case 'not_yet':
    case 'add_update': {
      const interval = nextInterval(note.reviewInterval, ladder);
      return {
        patch: {
          nextReviewAt: addDays(now, interval),
          reviewInterval: interval,
          reviewCount: note.reviewCount + 1,
          completedAt: null,
          archivedAt: null,
          updatedAt,
        },
        createsUpdate: answer === 'add_update',
      };
    }

    case 'done':
      return {
        patch: {
          nextReviewAt: null,
          reviewInterval: note.reviewInterval,
          reviewCount: note.reviewCount + 1,
          completedAt: updatedAt,
          archivedAt: null,
          updatedAt,
        },
        createsUpdate: false,
      };

    case 'let_go':
      return {
        patch: {
          nextReviewAt: null,
          reviewInterval: note.reviewInterval,
          reviewCount: note.reviewCount + 1,
          completedAt: null,
          archivedAt: updatedAt,
          updatedAt,
        },
        createsUpdate: false,
      };
  }
}

/** True when a note is an open commitment whose review has come around. */
export function isDue(note: Note, now: Date): boolean {
  if (note.deleted || note.archivedAt !== null || note.completedAt !== null) return false;
  if (note.nextReviewAt === null) return false;
  return new Date(note.nextReviewAt).getTime() <= now.getTime();
}

/** Due notes, most overdue first -- the review queue for the Today screen. */
export function dueNotes(notes: readonly Note[], now: Date): Note[] {
  return notes
    .filter((note) => isDue(note, now))
    .sort((a, b) => new Date(a.nextReviewAt!).getTime() - new Date(b.nextReviewAt!).getTime());
}

/**
 * Picks old notes to resurface alongside the due reviews.
 *
 * Takes a `random` function rather than calling Math.random so the Today screen
 * is deterministic in tests and can be seeded per-day in the app (so it doesn't
 * reshuffle every time the screen re-renders).
 */
export function resurfaceNotes(
  notes: readonly Note[],
  now: Date,
  count = 2,
  random: () => number = Math.random,
  minAgeDays = 14,
): Note[] {
  const cutoff = now.getTime() - minAgeDays * MS_PER_DAY;

  const eligible = notes.filter(
    (note) =>
      !note.deleted &&
      note.archivedAt === null &&
      note.kind === 'note' &&
      new Date(note.createdAt).getTime() <= cutoff &&
      !isDue(note, now),
  );

  // Partial Fisher-Yates: shuffle only what we need.
  const pool = [...eligible];
  const take = Math.min(count, pool.length);
  for (let i = 0; i < take; i++) {
    const j = i + Math.floor(random() * (pool.length - i));
    const a = pool[i]!;
    const b = pool[j]!;
    pool[i] = b;
    pool[j] = a;
  }

  return pool.slice(0, take);
}
