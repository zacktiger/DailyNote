import type { Profile } from '@dailynote/core';

import type { SocialRepo } from '@/db/social-repo';

/**
 * A handful of other people, so the feed is not an empty room.
 *
 * This is a **development stand-in for the server**, and the only file in the
 * app that invents content. When `social-repo` is reimplemented over HTTP this
 * file is deleted outright -- nothing else imports it, and nothing else depends
 * on these ids.
 *
 * The four threads are chosen to cover the states the feed has to render
 * differently: a post written straight to the feed, a private note its author
 * later shared, a thread that gained an update weeks later, and a commitment
 * that was actually finished. That last one is the product's whole argument, so
 * it needs to be visible on the first run.
 */

const DAY = 24 * 60 * 60 * 1000;

const AUTHORS: readonly Omit<Profile, 'createdAt'>[] = [
  {
    id: 'seed-0000-0000-0000-000000000001',
    handle: 'mara',
    displayName: 'Mara',
    bio: 'Learning things in public, slowly.',
    avatarUrl: null,
  },
  {
    id: 'seed-0000-0000-0000-000000000002',
    handle: 'tobias',
    displayName: 'Tobias Vale',
    bio: 'Gardener. Occasional woodworker.',
    avatarUrl: null,
  },
  {
    id: 'seed-0000-0000-0000-000000000003',
    handle: 'quiet_ren',
    displayName: null,
    bio: 'notes to self, published by accident',
    avatarUrl: null,
  },
];

interface SeedItem {
  id: string;
  authorId: string;
  slug: string;
  bornPublic: boolean;
  title: string;
  body: string;
  /** Days before now that it was published. */
  publishedDaysAgo: number;
  /** Days before now that something last happened to it. */
  activeDaysAgo: number;
  completed?: boolean;
  updateCount?: number;
}

const ITEMS: readonly SeedItem[] = [
  {
    id: 'seed-item-0000-0000-000000000001',
    authorId: 'seed-0000-0000-0000-000000000001',
    slug: 'six-weeks-of-rust',
    bornPublic: false,
    title: 'Six weeks of Rust',
    body: [
      'Six weeks of Rust',
      'Wrote this down in June and forgot about it until the app asked me what happened.',
      'What happened: I built a little CLI that renames photo files by their EXIF date.',
      'It is 300 lines and it works and I understand every one of them.',
      'The borrow checker stopped being an enemy somewhere around week four.',
    ].join('\n'),
    publishedDaysAgo: 44,
    activeDaysAgo: 1,
    completed: true,
    updateCount: 2,
  },
  {
    id: 'seed-item-0000-0000-000000000002',
    authorId: 'seed-0000-0000-0000-000000000002',
    slug: 'the-bench-is-finished',
    bornPublic: false,
    title: 'The bench is finished',
    body: [
      'The bench is finished',
      'Started it in March with a plank I could not afford and no idea what a mortise was.',
      'It wobbles slightly to the left. I have decided this is character.',
    ].join('\n'),
    publishedDaysAgo: 9,
    activeDaysAgo: 3,
    updateCount: 1,
  },
  {
    id: 'seed-item-0000-0000-000000000003',
    authorId: 'seed-0000-0000-0000-000000000003',
    slug: 'note',
    bornPublic: true,
    title: 'Nobody tells you',
    body: [
      'Nobody tells you',
      'that the hard part of keeping notes is not writing them,',
      'it is believing that the version of you who reads them later is a real person',
      'whose time is worth something.',
    ].join('\n'),
    publishedDaysAgo: 2,
    activeDaysAgo: 2,
  },
  {
    id: 'seed-item-0000-0000-000000000004',
    authorId: 'seed-0000-0000-0000-000000000001',
    slug: 'reading-list-audit',
    bornPublic: true,
    title: 'Reading list audit',
    body: [
      'Reading list audit',
      'Fourteen books started, three finished. Publishing this so I stop pretending the other eleven are pending.',
    ].join('\n'),
    publishedDaysAgo: 5,
    activeDaysAgo: 5,
  },
];

/**
 * Fills the mirror if it has never been filled.
 *
 * Idempotent by the presence of the first seeded author: re-running is a
 * no-op, and a user who blocks or unfollows these accounts does not get them
 * pushed back on the next launch.
 */
export async function seedSocial(repo: SocialRepo): Promise<void> {
  const first = AUTHORS[0];
  if (first === undefined) return;
  if ((await repo.profile(first.id)) !== null) return;

  const now = Date.now();
  const ago = (days: number) => new Date(now - days * DAY).toISOString();

  for (const author of AUTHORS) {
    await repo.upsertProfile({ ...author, createdAt: ago(120) });
  }

  for (const item of ITEMS) {
    await repo.mirror({
      id: item.id,
      authorId: item.authorId,
      slug: item.slug,
      bornPublic: item.bornPublic,
      title: item.title,
      body: item.body,
      doc: null,
      publishedAt: ago(item.publishedDaysAgo),
      activeAt: ago(item.activeDaysAgo),
      completedAt: item.completed === true ? ago(item.activeDaysAgo) : null,
      updateCount: item.updateCount ?? 0,
    });
  }
}
