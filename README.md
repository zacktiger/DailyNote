# DailyNote

> A private notes app where a note you wrote once comes back to you at the right time and asks
> whether anything came of it — and the ones worth sharing become a public record of what you
> actually followed through on.

Capture is table stakes; every notes app has it. **The follow-through loop is the product.**

Private by default, offline-first, open source.

**Note-taking is the main component.** Publishing, likes, views and followers are real parts of
the product, but they are a second, deliberate act performed on notes that were written privately
first — the composer never asks who will see this. The app is complete and worth using with the
network off and no account at all. See [docs/product.md](docs/product.md) for the full statement.

There is **no integration with Apple Notes or Google Keep**: there is no API to build against, so
it is dropped rather than deferred ([ADR 0003](docs/adr/0003-no-notes-app-integrations.md)).
Capture is the composer, the share sheet, and a `dailynote://` link.

## Status

**Rollout 1, Phase 0 complete.** Monorepo, CI, schema, domain logic and a working composer that
persists to SQLite. See [docs/plan.md](docs/plan.md) for the phase plan.

| | Rollout 1 — the notes app | |
|---|---|---|
| 0 | Foundations | ✅ done |
| 1 | A good local notes app | 🚧 in progress |
| 2 | Capture surfaces — share sheet, URL scheme | — |
| 3 | Follow-through — the differentiator | — |
| 4 | Accounts and sync | — |
| 5 | Import and expansion | — |
| 6 | Ship | — |

| | Rollout 2 — the social layer ([plan](docs/plan-rollout-2.md)) | |
|---|---|---|
| 2.0 | Identity — profiles and handles | — |
| 2.1 | **Publishing + public web pages** — the one to build first | — |
| 2.2 | Follows and a chronological feed | — |
| 2.3 | Comments, reactions, and full moderation | — |
| 2.4 | Themes as data, wallpapers | — |
| 2.5 | Discovery | — |

Rollout 2 starts after Rollout 1 Phase 4. R2.1 is independently shippable and works with zero
other users — if everything after it slips a year, there is still a notes app with shareable links.

## Privacy

**This app does not use end-to-end encryption, and the server can read your notes.** Notes are
encrypted in transit and at rest. Any note can be marked **local-only**, and those never leave
your device.

That is a deliberate trade — E2EE would permanently rule out search and AI features on the
server. The whole server is open source and self-hostable, which is our substitute for "trust
us". See [ADR 0002](docs/adr/0002-no-end-to-end-encryption.md).

## Layout

```
apps/mobile      Expo app (expo-router, NativeWind)          MIT
packages/core    pure TS domain logic, no RN, no Supabase    MIT
packages/db      Drizzle schema + Postgres migrations        AGPL-3.0
supabase         migrations, RLS policies                    AGPL-3.0
docs             product.md, the two rollout plans, ADRs
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

Later, a thread — a commitment plus the record of acting on it — is the thing you can publish.
Not a status post. That is why threads are built in Phase 3 and Rollout 2 is a publish button
over a structure that already exists.

## Licence

MIT for the app and core logic, AGPL-3.0-or-later for the database and server.
See [ADR 0004](docs/adr/0004-licensing.md).
