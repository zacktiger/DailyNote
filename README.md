# DailyNote

> A place where a note you wrote once comes back to you at the right time and asks whether
> anything came of it.

Capture is table stakes; every notes app has it. **The follow-through loop is the product.**

Private by default, offline-first, open source. Rollout 1 is a local notes app with a
follow-through loop and no account. The social layer is Rollout 2 and deliberately out of scope.

## Status

**Phase 0 complete.** Monorepo, CI, schema, domain logic and a working composer that persists to
SQLite. See [docs/plan.md](docs/plan.md) for the phase plan.

| Phase | | |
|---|---|---|
| 0 | Foundations | ✅ done |
| 1 | A good local notes app | 🚧 in progress |
| 2 | Capture surfaces | — |
| 3 | Follow-through | — |
| 4 | Accounts and sync | — |
| 5 | Import and expansion | — |
| 6 | Ship | — |

## Privacy

**This app does not use end-to-end encryption, and the server can read your notes.** Notes are
encrypted in transit and at rest. Any note can be marked **local-only**, and those never leave
your device.

That is a deliberate trade — E2EE would permanently rule out search and AI features on the
server. The whole server is open source and self-hostable, which is our substitute for "trust
us". See [ADR 0002](docs/adr/0002-no-end-to-end-encryption.md).

**We do not connect to Apple Notes or Google Keep.** No such API exists.
See [ADR 0003](docs/adr/0003-no-notes-app-integrations.md).

## Layout

```
apps/mobile      Expo app (expo-router, NativeWind)          MIT
packages/core    pure TS domain logic, no RN, no Supabase    MIT
packages/db      Drizzle schema + Postgres migrations        AGPL-3.0
supabase         migrations, RLS policies                    AGPL-3.0
docs             the plan and ADRs
```

`packages/core` holds hashtag parsing, title derivation, the review scheduler and search
ranking — the review scheduler is the piece most likely to have subtle bugs and the most annoying
to debug through a UI, so it is pure and unit tested without a simulator.

## Getting started

```bash
npm install
npm start              # Expo dev server
npm run android        # or: npm run ios
```

Requires Node ≥ 20.19. The app runs in Expo Go for Phase 1; a development build is needed once
native modules land in Phase 2.

### Checks

```bash
npm test               # packages/core, vitest
npm run typecheck
npm run lint
```

All three run in CI on every PR.

### Database

Nothing in Phase 1–3 touches Postgres — the app is local-only until Phase 4. To work on the
schema anyway, see [supabase/README.md](supabase/README.md).

## How it works

- Write a note. The composer is the launch screen — the app opens with the cursor in an empty
  note.
- Tags are inline `#hashtags` parsed out of the body. There is no tag picker.
- Write `#do`, or tap **Follow up**, and the note becomes a **commitment**: it comes back on a
  loose ladder — **+2d → +7d → +21d → +60d**.
- When it comes back it asks one question, *"Anything come of this?"*, with four answers:
  **Not yet** · **Add update** · **Done** · **Let go**.
- "Add update" appends to the note's **thread** — a commitment plus the record of acting on it.

No due dates, no overdue badges, no streaks. Guilt is the failure mode.

## Licence

MIT for the app and core logic, AGPL-3.0-or-later for the database and server.
See [ADR 0004](docs/adr/0004-licensing.md).
