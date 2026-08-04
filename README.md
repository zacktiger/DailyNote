# DailyNote

**A notes app that remembers what you meant to do.**

Private by default. Works offline. Open source.

---

## What it's for

You write things down and then you forget them. Not because you're careless — because a note just
sits there. Nothing about it ever asks for your attention again.

DailyNote is a normal notes app: open it, write, close it. Nothing to set up, no account, no
internet needed. But when a note is about something you actually meant to do, it comes back to you
later and asks one question:

> **Anything come of this?**

You get four answers. *Not yet.* *Add update.* *Done.* *Let go.*

That's the whole idea. Not reminders, not deadlines, not a streak you'll feel bad about breaking.
Just a note that shows up again at a sensible moment and gives you an easy way to say what
happened — including "nothing, and I'm letting it go."

There are no due dates and no overdue badges anywhere in this app. Feeling guilty is the thing we
are trying to avoid, not the thing we're trying to cause.

## And if you want, you can share

Some of what you write turns out to be worth showing people. A thing you said you'd learn, and
then did. A project that went somewhere.

So there's a **Feed**. You can publish a note you already wrote, or write a post straight to the
feed if that's what you feel like. You can read what other people have shared and follow the ones
worth following.

Two promises about it:

- **Your notes are private and stay that way.** Publishing is something you choose, note by note,
  afterwards. Nothing you write is public unless you say so.
- **You never have to.** No account is needed to write notes. If you never publish anything, you
  haven't missed out on anything — you just have a notes app, which is the point.

The writing screen never asks who's going to see it. Posting lives on its own tab, behind its own
composer, and tells you it's public before you type a word.

## What makes it different

Most feeds are full of people saying what they're *about* to do. "I'm going to learn Rust" is easy
to post and worth nothing.

Here, the thing that shows up in the feed is a **thread**: the original note, plus what actually
happened to it over time. When one resurfaces six weeks later carrying *"Done — here's what I
built"*, that's something no other feed has. Follow-through is the whole product, pointed inward
first and outward second.

---

## Status

Being built in the open, by one person, part-time. It runs, and it's already usable for notes.

**Two things are honest to say up front:** there's no server yet, so the social side runs against
local storage with a few sample authors standing in for other people. And syncing between devices
isn't built, so your notes live on the device that wrote them.

| | Rollout 1 — the notes app | |
|---|---|---|
| 0 | Foundations | ✅ done |
| 1 | A good local notes app | ✅ mostly there |
| 2 | Capture surfaces — share sheet, URL scheme | — |
| 3 | Follow-through — the differentiator | 🚧 notes come back; the four-answer card is next |
| 4 | Accounts and sync | 🚧 sign-in done, sync not |
| 5 | Import and expansion | — |
| 6 | Ship | — |

| | Rollout 2 — the social layer ([plan](docs/plan-rollout-2.md)) | |
|---|---|---|
| 2.0 | Identity — profiles and handles | ✅ done |
| 2.1 | Publishing | 🚧 works in the app; public web pages not built |
| 2.2 | Follows and a chronological feed | ✅ done |
| 2.3 | Conversation and safety | 🚧 likes, block and report done; comments not |
| 2.4 | Themes as data, wallpapers | — |
| 2.5 | Discovery | — |

Full plans: [docs/plan.md](docs/plan.md) · [docs/plan-rollout-2.md](docs/plan-rollout-2.md).
What the product *is*, as opposed to how it gets built: [docs/product.md](docs/product.md).

## Accounts

You don't need one to write notes. You never will — that isn't a trial, it's the design.

An account is asked for at exactly one moment: when you want to put something where other people
can read it. There are three ways in, and they all end up at the same account:

- **Google**
- **A six-digit code by email** — no password, so there's nothing to forget and nothing to leak
- **Sign in with Apple** — on iOS

Signing out leaves every note exactly where it is. They were never the account's.

Setting this up for your own build takes a few console steps: [docs/auth.md](docs/auth.md).

## Privacy

**This app does not use end-to-end encryption, and the server can read your notes.** Notes are
encrypted in transit and at rest. Any note can be marked **local-only**, and those never leave your
device: publishing one is refused in code, and the server schema carries a constraint that makes a
published local-only note impossible to store at all.

That's a deliberate trade: end-to-end encryption would permanently rule out server-side search. The
whole server is open source and self-hostable, which is our substitute for "trust us." See
[ADR 0002](docs/adr/0002-no-end-to-end-encryption.md).

There's also **no integration with Apple Notes or Google Keep**. Neither has an API to build
against, so it's dropped rather than promised
([ADR 0003](docs/adr/0003-no-notes-app-integrations.md)).

---

## For developers

### Layout

```
apps/mobile      Expo app (expo-router, NativeWind)          MIT
packages/core    pure TS domain logic, no RN, no Supabase    MIT
packages/db      Drizzle schema + Postgres migrations        AGPL-3.0
supabase         migrations, RLS policies                    AGPL-3.0
docs             product.md, the rollout plans, auth.md, ADRs
```

`packages/core` holds hashtag parsing, title derivation, the review scheduler, search ranking and
feed composition. These are the pieces most likely to have subtle bugs and the most annoying to
debug through a UI, so they're pure functions with unit tests and no simulator involved.

Two seams worth knowing about:

- **`apps/mobile/src/db/social-repo.ts`** is the entire social storage layer. When there's a real
  server, that one file gets reimplemented over HTTP and nothing else changes.
- **Feed rules are code, not database policy.** Row-level security answers one question — "is this
  row public" — and following, blocking and ordering are decided in `packages/core/src/social.ts`,
  where they can be tested.

### Getting started

```bash
npm install
npm start              # Expo dev server
npm run android        # or: npm run ios
```

Requires Node ≥ 20.19.

You'll need a **development build** rather than Expo Go — Google Sign-In is native code:

```bash
npx expo prebuild --clean
npx expo run:android
```

Sign-in needs credentials. Without them the app still launches, still takes notes and still reads
the feed; it just can't sign anyone in. Copy `apps/mobile/.env.example` to `.env.local` and see
[docs/auth.md](docs/auth.md).

### Checks

```bash
npm test               # packages/core, vitest
npm run typecheck
npm run lint
```

All three run in CI on every PR.

### Database

The app is local-only until sync lands, so nothing here touches Postgres day to day. To work on the
schema, see [supabase/README.md](supabase/README.md).

## Licence

MIT for the app and core logic, AGPL-3.0-or-later for the database and server.
See [ADR 0004](docs/adr/0004-licensing.md).
