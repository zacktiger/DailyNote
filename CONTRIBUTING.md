# Contributing

## Before you start

Read [docs/plan.md](docs/plan.md). It sets the scope, and the phase ordering is deliberate —
sync is Phase 4 *after* the app is good, because sync will eat weeks and it is not the product.

Two things are out of scope for Rollout 1 and PRs adding them will be closed:

- **The social layer / feed.** That is Rollout 2.
- **Notes-app integrations.** There is no API to integrate with — see
  [ADR 0003](docs/adr/0003-no-notes-app-integrations.md).

## Licence split

Know which half you are in — see [ADR 0004](docs/adr/0004-licensing.md):

| Path | Licence |
|---|---|
| `apps/mobile`, `packages/core` | MIT |
| `packages/db`, `supabase` | AGPL-3.0-or-later |

By contributing you agree your work is licensed under whichever applies to the files you touched.

## Setup

```bash
npm install
npm start
```

## Checks

Run before pushing; CI runs all three:

```bash
npm test
npm run typecheck
npm run lint
```

## Where code goes

**Domain logic belongs in `packages/core`.** If a rule can be expressed without React Native or
Supabase, it goes there with a unit test. That is where the real coverage lives, and it is why
the review scheduler can be debugged without a simulator.

`packages/core` must stay free of any React Native or Supabase import — the eventual server uses
it too.

**UI belongs in `apps/mobile/src/app`** (routes) and `src/components`. All persistence goes
through `NotesRepo`; do not reach for `expo-sqlite` from a screen. That interface is what keeps
the storage decision reversible — see [ADR 0001](docs/adr/0001-local-storage-shape.md).

**Schema changes** are authored in `packages/db/src/schema.ts`, then `npm run db:generate`. Keep
the local SQLite schema in `apps/mobile/src/db/migrations.ts` in step, and never edit a shipped
migration in place — append a new one.

## Conventions

- TypeScript strict. No `any` without a comment saying why.
- Comments explain *why*, not *what*. Prefer the reason the code is unusual over a restatement of
  it.
- Timestamps are ISO-8601 strings in the domain layer, `timestamptz` in Postgres, ISO text in
  SQLite.
- Soft delete only. `deleted` is a flag because `changesSince` sync cannot see a hard delete.

## Design constraints worth knowing

These come from the plan and are not up for casual revision:

- **No due dates, no overdue badges, no streaks.** The review card has four answers including
  "let go". If the app starts generating guilt, it has become a to-do list and failed.
- **Export must keep working.** Dumping every note as Markdown is what makes "trust me with your
  notes" a reasonable ask.
- **No public read path in RLS.** When the feed arrives it goes behind an API. Every day RLS
  stays simple is a day not spent debugging recursive policies.
