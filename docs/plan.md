# Implementation Plan — Rollout 1

**Goal:** a shippable, open-source, private notes app with fast capture and a follow-through loop.
**Explicitly out of scope:** the social layer. That is Rollout 2.

---

## 0. Three corrections to the stack doc

These change the plan, so they go first.

### 0.1 You cannot read Apple Notes or Google Keep. There is no API.

The pitch says "connect it to your local notes app and they get regularly uploaded." On both
platforms this is not buildable as described:

| Source | Programmatic read? | Reality |
|---|---|---|
| Apple Notes (iOS) | No | No public API, no share extension *out*, no file format on disk. AppleScript exists on macOS only. |
| Google Keep | No | No public API. The `keep.googleapis.com` API is Workspace-admin-only and cannot read consumer notes. |
| Samsung Notes / MIUI Notes | No | Proprietary, no exported API. |
| Obsidian / Markdown vault | **Yes** | Plain files in a folder. |
| Any app | **Yes, user-initiated** | Share sheet. |

So "connect your notes app" has to be reframed, and this is the honest version:

1. **Share sheet** (`expo-share-intent`) — works everywhere, one tap, both platforms. This is the
   real primary ingestion path.
2. **URL scheme + iOS Shortcuts** — ship `yourapp://new?text=...&source=shortcuts`. Then publish a
   Shortcut recipe users install once: *"When I leave a note in Apple Notes tagged #share, send it
   to the app."* Shortcuts can read Notes even though you cannot. **You get Apple Notes ingestion
   by proxy, for roughly 20 lines of deep-link code.** Highest leverage item in the whole plan.
3. **Markdown folder sync** — Android via `expo-file-system` StorageAccessFramework (persistable
   URI permission, survives reboot). iOS folder access is materially harder and is a Phase 5 item,
   not a Phase 1 one.
4. **Clipboard / quick capture widget** — Phase 5.

Do not promise "auto-sync with your notes app" in store copy. Promise "one tap from anywhere,
and an automation recipe for Apple Notes." That is deliverable and honest.

### 0.2 "expo-sqlite as source of truth" and "Legend-State persistence" are probably in conflict

Legend-State's persistence plugins are **key-value**: they serialize an observable under a name.
The expo-sqlite plugin, as far as I know, stores blobs, not relational rows. If that holds, then:

- You do **not** get local SQL over your notes.
- You do **not** get SQLite FTS5 search.
- `expo-sqlite` is a storage backend, not "the source of truth" in the way the doc implies.

**Spike this on day one** (~1 hour): persist 5 notes through Legend-State, then open the DB with
`expo-sqlite` and inspect the table. If you see one row of JSON, the doc's premise is wrong.

Two viable resolutions:

| | A — Legend-State owns it (recommended for R1) | B — real tables + hand-rolled sync |
|---|---|---|
| Local search | JS filter over in-memory array | SQLite FTS5 |
| Ceiling | ~10–20k notes before startup/memory hurts | effectively unbounded |
| Code you write | ~0 sync code | ~300 lines push/pull |
| Migration cost later | rewrite ~4 read paths | none |

**Recommendation: A.** One person's notes will not hit 10k for years, JS filtering 10k short
strings is sub-frame, and the read surface is tiny (list, search, one note, due-today) so the
escape hatch stays cheap. Revisit at PowerSync time, which is Rollout 2 anyway.

If the spike shows relational tables, take B and get FTS5 free. Either way, **decide this in
week 1** — it is the only decision in the stack that is expensive to reverse.

### 0.3 Encryption vs. AI: you can only pick one, and you should pick now

The doc banks on pgvector + FTS in Postgres for cheap AI later. That requires plaintext on the
server. So end-to-end encryption is off the table permanently, not "later."

For an app whose entire value proposition is *"put your private daily notes here,"* this is a
trust decision, not a technical one. Pick one and write it into the README:

- **Recommended:** no E2EE. Encrypted at rest and in transit, readable by the server, stated
  plainly in onboarding. Add a per-note **"local only, never syncs"** flag as the pressure valve
  for anything sensitive. Ships fast, keeps Phase 5 AI viable, and open-sourcing the server plus
  self-host docs is the credibility substitute for E2EE.
- **Alternative:** E2EE. Kills server-side search and semantic features. Only take this if you
  believe privacy is the wedge.

Do not defer. Retrofitting E2EE onto a synced note store is a rewrite.

---

## 1. What the product actually is

Reduced to one sentence so scope creep has something to bounce off:

> A place where a note you wrote once comes back to you at the right time and asks whether
> anything came of it.

Capture is table stakes; every notes app has it. **The follow-through loop is the product.**
Build it in Phase 3, not "later."

### The loop

- Every note can be promoted to a **commitment** (tap "Follow up", or write `#do`). That sets
  `next_review_at`.
- Default cadence: **+2d → +7d → +21d → +60d**. Loose spaced repetition, not SM-2. Tunable per note.
- On review, exactly one question — *"Anything come of this?"* — with four answers:
  - **Not yet** → advance the interval, no guilt
  - **Add update** → creates a *child note in the same thread*
  - **Done** → close the thread
  - **Let go** → archive
- **Today** screen = due reviews + 2 randomly resurfaced old notes.
- One local notification per day at a user-set time. **Scheduled locally via `expo-notifications`
  — no push infrastructure in Rollout 1.**

### Why threads matter architecturally

A thread is `root note + its updates over time`. That is the Rollout 2 social unit: not a status
post, but *a thing someone said they'd do plus the record of them doing it.* Building threads in
Phase 3 means Rollout 2 is a publish button over an existing structure, not a new data model.
This is the single highest-value seam in the plan.

---

## 2. Data model

Design the sync columns in Phase 1 even though sync lands in Phase 4. This is what makes Phase 4
wiring instead of migration.

```sql
create table notes (
  id            uuid primary key,              -- client-generated, offline-safe
  user_id       uuid references auth.users,    -- nullable pre-auth (Phase 1-3)
  body          text not null,
  title         text,                          -- derived from first line, cached

  -- threading / follow-through
  root_id       uuid not null,                 -- == id for a root note
  parent_id     uuid references notes(id),
  kind          text not null default 'note'
                check (kind in ('note','update')),

  -- review engine
  next_review_at   timestamptz,                -- null = not a commitment
  review_interval  int,                        -- days
  review_count     int not null default 0,
  archived_at      timestamptz,
  completed_at     timestamptz,

  -- provenance
  source        text not null default 'composer'
                check (source in ('composer','share','shortcut','import','clipboard')),
  source_ref    text,                          -- url, package name, file path

  -- publishing: DB-enforced, per the doc's rule
  visibility    text not null default 'private'
                check (visibility in ('private','unlisted','public')),
  published_at  timestamptz,
  local_only    boolean not null default false, -- never leaves the device

  -- sync
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),  -- trigger-maintained
  deleted       boolean not null default false,      -- soft delete, sync requires it

  constraint private_is_unpublished check (
    visibility <> 'private' or published_at is null
  )
);

create table tags       (id uuid primary key, user_id uuid, name text, unique(user_id, name));
create table note_tags  (note_id uuid, tag_id uuid, primary key (note_id, tag_id));
```

Notes on the model:

- **Tags come from inline `#hashtags` parsed out of the body.** No tag UI, no tag picker. It
  matches how people already write in notes apps, and it costs one regex.
- `local_only` is the E2EE pressure valve from §0.3. Enforce it in the sync layer *and* keep those
  rows out of the outbound set entirely.
- `deleted` (not `deleted_at`) because Legend-State's `changesSince: 'last-sync'` expects a
  soft-delete flag it can filter on.
- Attachments, images, and link unfurling are **out of Rollout 1.** Text and URLs only.

### RLS

```sql
alter table notes enable row level security;
create policy own_notes on notes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

That is the entire policy set for Rollout 1. **There is no public read path, because there is no
publishing yet.** The safest publish path is the one that doesn't exist. Resist adding a
"public" policy speculatively — that is exactly the RLS-as-feed-logic trap the stack doc warns
about.

### Conflicts

Row-level last-write-wins, which is what Legend-State gives you. It loses data when two offline
devices edit the same note. Mitigation, cheap and honest: on detecting incoming `updated_at` >
local base while local is dirty, **keep both** — write the loser as a new note titled
`"<title> (conflicted copy)"`. Obsidian and Apple Notes both do this and users understand it.
Do not build CRDTs for Rollout 1.

---

## 3. Repo layout

```
/apps/mobile          expo app, expo-router
/packages/core        pure TS: hashtag parsing, review scheduler, title derivation, search ranking
/packages/db          drizzle schema (pg), migrations, shared zod types
/supabase             migrations, RLS policies, seed data
/docs                 ADRs, this plan
```

`packages/core` exists so the follow-through logic is **unit-testable without a simulator.** The
review scheduler is the piece most likely to have subtle bugs and the most annoying to debug
through a UI. Keep it pure.

**Drizzle's role in Rollout 1 is schema authoring and Postgres migrations only.** Nothing in the
app imports it at runtime, because there is no API server yet and Legend-State talks to Supabase
directly. That is fine — just don't be surprised when it looks unused for the first month.

**Testing:** Vitest for `packages/core` (this is where the real coverage goes), Maestro for e2e
flows. Maestro over Detox — significantly less setup pain on Expo.

---

## 4. Phases

Estimates assume one person, part-time. They are guesses; treat the ordering as the real output.

### Phase 0 — Foundations · ~3 days
- Expo app, expo-router, NativeWind, TypeScript strict, monorepo
- EAS build profiles: `development`, `preview`, `production`
- License decision (see §6), README, CONTRIBUTING
- CI: typecheck + lint + `packages/core` tests on PR
- **Exit:** dev build installs on a real device, CI is green

### Phase 1 — A good local notes app · ~2 weeks
No auth. No network. No account. The app must be genuinely usable offline-forever.

- Composer as the **launch screen** — app opens with the cursor already in an empty note
- Notes list, note detail, edit, soft delete, undo
- Inline `#hashtag` parsing → tag chips, filter by tag
- Search (see §0.2 for which mechanism)
- **Export from day one:** dump all notes as `.md` files in a zip. Non-negotiable for a notes
  app; it is what makes "trust me with your notes" a reasonable ask
- Full sync-column schema in place, unused
- **Exit:** you use it as your own daily notes app for a week without reaching for another app

That last exit criterion is the real gate. If it fails, no amount of Phase 3 fixes it.

### Phase 2 — Capture surfaces · ~1 week
- `expo-share-intent` → share sheet, text + URL, both platforms
- URL scheme + `+native-intent.ts`, and **ship the iOS Shortcut recipe** (§0.1). Write it, test
  it, put the install link in onboarding
- Android: persistent low-priority notification with a "New note" action. Far cheaper than a
  widget and covers most of the value
- Captured items land private, tagged with `source`
- **Exit:** you can capture from another app in under 3 seconds, on both platforms

### Phase 3 — Follow-through · ~2 weeks
This is the differentiator. Do not compress it.

- `packages/core` review scheduler, fully unit tested
- Promote-to-commitment interaction
- **Today** screen: due reviews + resurfaced notes
- The four-answer review card
- Thread view: root note + updates, chronological
- Daily local notification, user-set time, respects timezone changes
- **Exit:** the app changed something you actually followed through on

### Phase 4 — Accounts and sync · ~2 weeks
Deliberately after the app is good. Sync will eat weeks and it is not the product.

- Supabase Auth, email + magic link
- **Start anonymous.** Users write before signing up; account creation claims existing local
  notes. Supabase anonymous sign-in handles this. Forcing signup before the first note is the
  most common way apps like this die
- Legend-State `syncedSupabase`, `changesSince: 'last-sync'`, `updated_at` trigger
- Conflict handling per §2
- `local_only` notes excluded from the outbound set — test this explicitly
- **Exit:** two devices, airplane mode on both, edits on each, reconnect, nothing lost

### Phase 5 — Import and expansion · ~1–2 weeks
- Markdown folder sync, Android via SAF (persistable permission)
- Bulk `.md` / `.txt` import on both platforms
- iOS home screen + Lock Screen widget (`expo-apple-targets` config plugin)
- iOS folder sync, if the widget work makes the native tooling familiar enough
- **Exit:** an Obsidian user can point at a vault and get their notes in

### Phase 6 — Ship · ~1 week
- Onboarding: 3 screens, one of which is the privacy statement from §0.3
- Store listings, screenshots, privacy nutrition labels
- TestFlight + Play internal testing
- F-Droid submission if the build is dependency-clean (Supabase SDK is fine; check for
  proprietary blobs from any analytics)
- Crash reporting: **Sentry, opt-in.** Analytics: none, or opt-in and self-hosted. For a private
  notes app, silent telemetry is a credibility loss you cannot buy back

**Total to shippable: roughly 9–11 weeks part-time.**

---

## 5. Seams to leave for Rollout 2

Cheap now, expensive to retrofit:

- `visibility` and `published_at` columns exist and are DB-constrained (§2) — done in Phase 1
- Threads are the publishable unit (§1) — done in Phase 3
- No feed logic in RLS. When the feed arrives it goes behind Hono on Workers, as the stack doc
  says. Every day you keep RLS simple is a day you're not debugging recursive policies
- Notes carry stable client-generated UUIDs, so public URLs can be derived without a remap
- Keep `packages/core` free of any RN or Supabase import so the eventual server can use it

---

## 6. Open decisions

Ordered by how expensive they are to defer.

| # | Decision | Recommendation | Deadline |
|---|---|---|---|
| 1 | Legend-State persistence shape (§0.2) | Spike it, then A | Week 1 |
| 2 | E2EE or server-readable (§0.3) | Server-readable + `local_only` flag | Week 1 |
| 3 | License | **AGPL-3.0** for the server, **MIT** for the app. AGPL is what stops a Rollout-2 feed from being lifted as a closed SaaS while keeping the client trivially forkable | Phase 0 |
| 4 | Sign in with Apple | **Not required** if magic-link is the only auth. Apple mandates it only when you offer third-party social login. Skipping it is correct for Rollout 1 | Phase 4 |
| 5 | Name + bundle ID | Whatever — but register it before Phase 2, deep links depend on it | Phase 2 |
| 6 | Web | Marketing page only. Do not ship Expo Web in Rollout 1 | Phase 6 |

---

## 7. Risks

| Risk | Mitigation |
|---|---|
| "Connect your notes app" is undeliverable as pitched | Reframe to share sheet + Shortcuts recipe + markdown folder (§0.1). Fix the messaging before writing store copy |
| Follow-through becomes a to-do list | The review card has **four** answers including "let go". No due dates, no overdue red badges, no streaks. Guilt is the failure mode |
| Sync eats the project | It is Phase 4, behind a working app. If it slips, you still have something shippable |
| SDK 57 / library versions in the stack doc are stale by ship time | Pin versions in Phase 0, upgrade deliberately once, mid-Phase-4 |
| Notes-app market is brutal | The wedge is not capture, it is resurfacing. If Phase 3 doesn't feel different, stop and rethink before Phase 4 |

---

## 8. First week, concretely

1. Spike Legend-State persistence, inspect the SQLite file, decide §0.2 — **1 hour, do it first**
2. Decide §0.3 and write it into the README
3. `create-expo-app`, monorepo, NativeWind, expo-router, CI
4. Drizzle schema from §2, Supabase project, migration applied
5. Composer screen that saves to local storage and survives an app restart

Item 5 is the whole thing in miniature. If it feels good to type into, you have a product.
