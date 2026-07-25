import { describe, expect, it } from 'vitest';
import {
  addDays,
  applyReview,
  clearCommitment,
  DEFAULT_REVIEW_LADDER,
  dueNotes,
  isDue,
  nextInterval,
  promoteToCommitment,
  resurfaceNotes,
} from './review';
import { makeNote } from './test-support';

const NOW = new Date('2026-07-26T09:00:00.000Z');

describe('addDays', () => {
  it('adds whole days and preserves the clock time', () => {
    expect(addDays(NOW, 2)).toBe('2026-07-28T09:00:00.000Z');
  });

  it('accepts an ISO string', () => {
    expect(addDays('2026-07-26T09:00:00.000Z', 7)).toBe('2026-08-02T09:00:00.000Z');
  });

  it('crosses a month boundary correctly', () => {
    expect(addDays('2026-01-31T09:00:00.000Z', 1)).toBe('2026-02-01T09:00:00.000Z');
  });

  it('handles a leap day', () => {
    expect(addDays('2028-02-28T09:00:00.000Z', 1)).toBe('2028-02-29T09:00:00.000Z');
  });
});

describe('nextInterval', () => {
  it('starts at the first rung', () => {
    expect(nextInterval(null)).toBe(2);
  });

  it('walks the ladder 2 -> 7 -> 21 -> 60', () => {
    expect(nextInterval(2)).toBe(7);
    expect(nextInterval(7)).toBe(21);
    expect(nextInterval(21)).toBe(60);
  });

  it('repeats the last rung forever rather than terminating', () => {
    expect(nextInterval(60)).toBe(60);
    expect(nextInterval(999)).toBe(60);
  });

  it('snaps an off-ladder value up to the next rung', () => {
    expect(nextInterval(5)).toBe(7);
    expect(nextInterval(1)).toBe(2);
  });

  it('accepts a custom ladder', () => {
    expect(nextInterval(null, [1, 3])).toBe(1);
    expect(nextInterval(1, [1, 3])).toBe(3);
    expect(nextInterval(3, [1, 3])).toBe(3);
  });

  it('falls back to the default ladder when given an empty one', () => {
    expect(nextInterval(null, [])).toBe(DEFAULT_REVIEW_LADDER[0]);
  });
});

describe('promoteToCommitment', () => {
  it('schedules the first review two days out', () => {
    const patch = promoteToCommitment(
      { nextReviewAt: null, reviewInterval: null, reviewCount: 0 },
      NOW,
    );
    expect(patch.nextReviewAt).toBe('2026-07-28T09:00:00.000Z');
    expect(patch.reviewInterval).toBe(2);
    expect(patch.reviewCount).toBe(0);
  });

  it('is idempotent -- re-promoting does not reset the schedule', () => {
    const existing = {
      nextReviewAt: '2026-08-20T09:00:00.000Z',
      reviewInterval: 21,
      reviewCount: 3,
    };
    const patch = promoteToCommitment(existing, NOW);
    expect(patch.nextReviewAt).toBe(existing.nextReviewAt);
    expect(patch.reviewInterval).toBe(21);
    expect(patch.reviewCount).toBe(3);
  });
});

describe('clearCommitment', () => {
  it('demotes without archiving', () => {
    const patch = clearCommitment(NOW);
    expect(patch.nextReviewAt).toBeNull();
    expect(patch.reviewInterval).toBeNull();
  });
});

describe('applyReview', () => {
  const commitment = { nextReviewAt: '2026-07-26T09:00:00.000Z', reviewInterval: 2, reviewCount: 1 };

  it('"not yet" advances the interval and bumps the count', () => {
    const { patch, createsUpdate } = applyReview(commitment, 'not_yet', NOW);
    expect(patch.reviewInterval).toBe(7);
    expect(patch.nextReviewAt).toBe('2026-08-02T09:00:00.000Z');
    expect(patch.reviewCount).toBe(2);
    expect(patch.completedAt).toBeNull();
    expect(patch.archivedAt).toBeNull();
    expect(createsUpdate).toBe(false);
  });

  it('"add update" advances the schedule and asks for a child note', () => {
    const { patch, createsUpdate } = applyReview(commitment, 'add_update', NOW);
    expect(createsUpdate).toBe(true);
    expect(patch.reviewInterval).toBe(7);
    expect(patch.nextReviewAt).toBe('2026-08-02T09:00:00.000Z');
    expect(patch.reviewCount).toBe(2);
  });

  it('"done" closes the thread and stops the reviews', () => {
    const { patch, createsUpdate } = applyReview(commitment, 'done', NOW);
    expect(patch.nextReviewAt).toBeNull();
    expect(patch.completedAt).toBe(NOW.toISOString());
    expect(patch.archivedAt).toBeNull();
    expect(createsUpdate).toBe(false);
  });

  it('"let go" archives and stops the reviews', () => {
    const { patch } = applyReview(commitment, 'let_go', NOW);
    expect(patch.nextReviewAt).toBeNull();
    expect(patch.archivedAt).toBe(NOW.toISOString());
    expect(patch.completedAt).toBeNull();
  });

  it('walks the full ladder across repeated "not yet" answers', () => {
    let state = { nextReviewAt: null as string | null, reviewInterval: null as number | null, reviewCount: 0 };
    const seen: number[] = [];

    for (let i = 0; i < 6; i++) {
      const { patch } = applyReview(state, 'not_yet', NOW);
      seen.push(patch.reviewInterval!);
      state = {
        nextReviewAt: patch.nextReviewAt,
        reviewInterval: patch.reviewInterval,
        reviewCount: patch.reviewCount,
      };
    }

    expect(seen).toEqual([2, 7, 21, 60, 60, 60]);
    expect(state.reviewCount).toBe(6);
  });

  it('reviving a completed note clears completedAt', () => {
    const completed = { nextReviewAt: null, reviewInterval: 7, reviewCount: 4 };
    const { patch } = applyReview(completed, 'not_yet', NOW);
    expect(patch.completedAt).toBeNull();
    expect(patch.nextReviewAt).toBe('2026-08-16T09:00:00.000Z');
  });
});

describe('isDue', () => {
  it('is true when the review time has passed', () => {
    expect(isDue(makeNote({ nextReviewAt: '2026-07-25T09:00:00.000Z' }), NOW)).toBe(true);
  });

  it('is true at exactly the review time', () => {
    expect(isDue(makeNote({ nextReviewAt: NOW.toISOString() }), NOW)).toBe(true);
  });

  it('is false before the review time', () => {
    expect(isDue(makeNote({ nextReviewAt: '2026-07-27T09:00:00.000Z' }), NOW)).toBe(false);
  });

  it('is false for a note that is not a commitment', () => {
    expect(isDue(makeNote({ nextReviewAt: null }), NOW)).toBe(false);
  });

  it('is false for archived, completed and deleted notes', () => {
    const due = '2026-07-01T09:00:00.000Z';
    expect(isDue(makeNote({ nextReviewAt: due, archivedAt: due }), NOW)).toBe(false);
    expect(isDue(makeNote({ nextReviewAt: due, completedAt: due }), NOW)).toBe(false);
    expect(isDue(makeNote({ nextReviewAt: due, deleted: true }), NOW)).toBe(false);
  });
});

describe('dueNotes', () => {
  it('returns due notes most overdue first', () => {
    const notes = [
      makeNote({ id: 'b', nextReviewAt: '2026-07-20T09:00:00.000Z' }),
      makeNote({ id: 'a', nextReviewAt: '2026-07-10T09:00:00.000Z' }),
      makeNote({ id: 'future', nextReviewAt: '2026-08-10T09:00:00.000Z' }),
      makeNote({ id: 'plain', nextReviewAt: null }),
    ];
    expect(dueNotes(notes, NOW).map((n) => n.id)).toEqual(['a', 'b']);
  });

  it('returns an empty array when nothing is due', () => {
    expect(dueNotes([makeNote({ nextReviewAt: null })], NOW)).toEqual([]);
  });
});

describe('resurfaceNotes', () => {
  const old = { createdAt: '2026-01-01T09:00:00.000Z' };

  it('picks the requested number of old notes', () => {
    const notes = [
      makeNote({ id: '1', ...old }),
      makeNote({ id: '2', ...old }),
      makeNote({ id: '3', ...old }),
    ];
    expect(resurfaceNotes(notes, NOW, 2, () => 0)).toHaveLength(2);
  });

  it('is deterministic given a seeded random', () => {
    const notes = [
      makeNote({ id: '1', ...old }),
      makeNote({ id: '2', ...old }),
      makeNote({ id: '3', ...old }),
    ];
    const a = resurfaceNotes(notes, NOW, 2, () => 0.5).map((n) => n.id);
    const b = resurfaceNotes(notes, NOW, 2, () => 0.5).map((n) => n.id);
    expect(a).toEqual(b);
  });

  it('never returns the same note twice', () => {
    const notes = Array.from({ length: 5 }, (_, i) => makeNote({ id: String(i), ...old }));
    const picked = resurfaceNotes(notes, NOW, 5, () => 0.999).map((n) => n.id);
    expect(new Set(picked).size).toBe(picked.length);
  });

  it('excludes notes that are too recent', () => {
    const notes = [makeNote({ id: 'fresh', createdAt: '2026-07-25T09:00:00.000Z' })];
    expect(resurfaceNotes(notes, NOW, 2, () => 0)).toEqual([]);
  });

  it('excludes archived, deleted, due and update notes', () => {
    const notes = [
      makeNote({ id: 'archived', ...old, archivedAt: '2026-02-01T09:00:00.000Z' }),
      makeNote({ id: 'deleted', ...old, deleted: true }),
      makeNote({ id: 'due', ...old, nextReviewAt: '2026-07-01T09:00:00.000Z' }),
      makeNote({ id: 'update', ...old, kind: 'update' }),
    ];
    expect(resurfaceNotes(notes, NOW, 4, () => 0)).toEqual([]);
  });

  it('returns fewer than requested rather than padding', () => {
    expect(resurfaceNotes([makeNote({ id: '1', ...old })], NOW, 2, () => 0)).toHaveLength(1);
  });

  it('handles an empty corpus', () => {
    expect(resurfaceNotes([], NOW, 2, () => 0)).toEqual([]);
  });
});
