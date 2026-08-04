# DailyNote

**A notes app that remembers what you meant to do.**

Private by default. Works offline. Open source.

---

Write a note. When it's about something you meant to do, it comes back later and asks one
question — *anything come of this?* — with four answers: **Not yet · Add update · Done · Let go.**

No due dates, no streaks, no guilt.

The ones worth showing people, you can publish to a **Feed** — note by note, afterwards, and only
if you want to. Nothing is public unless you say so, and writing needs no account at all.

📖 **[The longer version](docs/about.md)** — the idea, the sharing, accounts, privacy
· 📐 [What it is, precisely](docs/product.md) · 🔑 [Accounts setup](docs/auth.md)

## Status

Built in the open, by one person, part-time. Usable for notes today.

Two things to know before cloning: **there's no server yet**, so the social side runs against local
storage with a few sample authors standing in for other people, and **there's no sync**, so notes
live on the device that wrote them.

**[Rollout 1 — the notes app](docs/plan.md)**

| ✅ | Foundations · a good local notes app |
|---|---|
| 🚧 | Follow-through (notes come back; the four-answer card is next) · accounts (sync is next) |
| — | Share sheet and URL scheme · import · ship |

**[Rollout 2 — the social layer](docs/plan-rollout-2.md)**

| ✅ | Profiles and handles · follows and the feed |
|---|---|
| 🚧 | Publishing (works in-app; public web pages not built) · safety (no comments yet) |
| — | Themes and wallpapers · discovery |

## Getting started

```bash
npm install
npm start              # Expo dev server
npm run android        # or: npm run ios
```

Requires Node ≥ 20.19, and a **development build** rather than Expo Go — Google Sign-In is native
code:

```bash
npx expo prebuild --clean
npx expo run:android
```

Sign-in needs credentials. Without them the app still launches, still takes notes and still reads
the feed. Copy `apps/mobile/.env.example` to `.env.local` and see [docs/auth.md](docs/auth.md).

### Checks

```bash
npm test               # packages/core, vitest
npm run typecheck
npm run lint
```

All three run in CI on every PR.

## Layout

```
apps/mobile      Expo app (expo-router, NativeWind)          MIT
packages/core    pure TS domain logic, no RN, no Supabase    MIT
packages/db      Drizzle schema + Postgres migrations        AGPL-3.0
supabase         migrations, RLS policies                    AGPL-3.0
docs             about.md, product.md, the plans, auth.md, ADRs
```

`packages/core` holds hashtag parsing, title derivation, the review scheduler, search ranking and
feed composition — the pieces most likely to have subtle bugs and the most annoying to debug
through a UI, so they're pure functions with unit tests and no simulator involved.

Two seams worth knowing about:

- **`apps/mobile/src/db/social-repo.ts`** is the entire social storage layer. When there's a real
  server, that one file gets reimplemented over HTTP and nothing else changes.
- **Feed rules are code, not database policy.** Row-level security answers one question — "is this
  row public" — while following, blocking and ordering are decided in
  `packages/core/src/social.ts`, where they can be tested.

The app is local-only until sync lands, so nothing here touches Postgres day to day. To work on the
schema, see [supabase/README.md](supabase/README.md).

## Licence

MIT for the app and core logic, AGPL-3.0-or-later for the database and server.
See [ADR 0004](docs/adr/0004-licensing.md).
