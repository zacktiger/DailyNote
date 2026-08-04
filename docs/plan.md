# Implementation Plan — Rollout 1

**Goal:** a shippable, open-source, private notes app with fast capture and a follow-through loop.
**Explicitly out of scope:** the social layer. That is [Rollout 2](plan-rollout-2.md).
**What the product is, whole:** [product.md](product.md). If this plan contradicts it, that doc wins.

---

## 0. Three corrections to the stack doc — all now decided

These changed the plan, so they went first. Each has since been settled in an ADR; the sections
below are kept for the reasoning, but **the ADR is the current answer.**

| | Question | Settled by |
|---|---|---|
| 0.1 | Can we read Apple Notes / Google Keep? | [ADR 0003](adr/0003-no-notes-app-integrations.md) — no API, integration dropped |
| 0.2 | Legend-State persistence vs. relational SQLite | [ADR 0001](adr/0001-local-storage-shape.md) — real tables behind a repository interface |
| 0.3 | E2EE or server-readable | [ADR 0002](adr/0002-no-end-to-end-encryption.md) — server-readable, `local_only` is the valve |

### 0.1 You cannot read Apple Notes or Google Keep. There is no API.

> **Decided: dropped entirely.** See [ADR 0003](adr/0003-no-notes-app-integrations.md), which
> supersedes the recommendation in this section — including the Shortcuts recipe.

The original pitch said "connect it to your local notes app and they get regularly uploaded." On
both platforms this is not buildable as described:

| Source | Programmatic read? | Reality |
|---|---|---|
| Apple Notes (iOS) | No | No public API, no share extension *out*, no file format on disk. AppleScript exists on macOS only. |
| Google Keep | No | No public API. The `keep.googleapis.com` API is Workspace-admin-only and cannot read consumer notes. |
| Samsung Notes / MIUI Notes | No | Proprietary, no exported API. |
| Obsidian / Markdown vault | **Yes** | Plain files in a folder. |
| Any app | **Yes, user-initiated** | Share sheet. |

So there is no integration to build. Capture is user-initiated, everywhere:

1. **Composer** — the launch screen. The primary path by a wide margin.
2. **Share sheet** (`expo-share-intent`) — works everywhere, one tap, both platforms. Phase 2.
3. **URL scheme** — `dailynote://new?text=...`. ~20 lines, Phase 2. ADR 0003 keeps the deep link
   and drops the *published Shortcut recipe* that was going to sit on top of it: shipping a recipe
   means owning it every time Apple changes Shortcuts. Revisit as documentation after Phase 2.
4. **Markdown folder sync** — Android via `expo-file-system` StorageAccessFramework (persistable
   URI permission, survives reboot). A folder of files is not an API, and Obsidian users are a real
   target. iOS folder access is materially harder. Both Phase 5.
5. **Clipboard / quick capture widget** — Phase 5.

Do not promise "auto-sync with your notes app" in store copy. Promise "one tap from anywhere."
That is deliverable and honest.

### 0.2 "expo-sqlite as source of truth" and "Legend-State persistence" are probably in conflict

> **Decided for now:** [ADR 0001](adr/0001-local-storage-shape.md) takes neither A nor B yet. Phase
> 1–3 uses real relational SQLite tables behind a repository interface, which keeps both doors
> open; the A-vs-B choice moves to Phase 4, when sync makes it actually load-bearing. The spike
> below still needs running before then.

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

> **Decided: no E2EE**, per [ADR 0002](adr/0002-no-end-to-end-encryption.md) — the recommended
> option below. It is stated plainly in the README and belongs in onboarding.

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

The full statement is [product.md](product.md). Reduced to one sentence so scope creep has
something to bounce off:

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
  body          text not null,                 -- plain-text projection of doc
  title         text,                          -- derived from first line, cached
  doc           text,                          -- block document as JSON; null = plain text

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
- **`doc` holds the block document; `body` is its plain-text projection.** A note is a list of
  blocks (paragraph, bullet, image), each with an alignment, serialized into `doc` by
  `@dailynote/core`'s document module. `body` is rewritten from it on every edit, so search,
  `#hashtag` parsing, `deriveTitle` and the sync cursor keep reading one plain string and never
  learn about blocks. A null `doc` is a plain-text note and parses back as paragraphs, which is
  why rich text needed no backfill.
- **Local images are in Rollout 1; other attachments and link unfurling are not.** A picked photo
  is copied into `documentDirectory/attachments/` and the note stores the *relative* path — the
  iOS app container moves between installs. Nothing is uploaded: there is no Storage bucket, and
  how attachments sync is a Phase 4 question, not one this answers.

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
/packages/core        pure TS: hashtag parsing, review scheduler, title derivation, search ranking,
                      the block document (parse, serialize, project to text, edit)
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
- `dailynote://new?text=...` URL scheme + `+native-intent.ts`. **No Shortcut recipe** — ADR 0003
  drops it as a shipped promise. The deep link is what makes one writable later, by anyone
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

- ~~Supabase Auth, email + magic link~~ — **done, and it is three providers, not one**: Google,
  a six-digit email code (not a magic link — the mail-to-browser-to-app handoff loses people), and
  Sign in with Apple. See [auth.md](auth.md). Sync is the part of this phase still outstanding
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

Ordered by how expensive they are to defer. See [the ADR index](adr/README.md) for the current
state of all of these.

| # | Decision | Outcome | |
|---|---|---|---|
| 1 | Legend-State persistence shape (§0.2) | Relational SQLite behind a repository interface; A-vs-B deferred to Phase 4 — [ADR 0001](adr/0001-local-storage-shape.md) | ✅ |
| 2 | E2EE or server-readable (§0.3) | Server-readable + `local_only` flag — [ADR 0002](adr/0002-no-end-to-end-encryption.md) | ✅ |
| 3 | License | MIT app + core, AGPL-3.0 DB + server — [ADR 0004](adr/0004-licensing.md) | ✅ |
| 5 | Name + bundle ID | **DailyNote**, `com.zacktiger.dailynote`, scheme `dailynote://` | ✅ |
| — | Notes-app integration | Dropped, no API exists — [ADR 0003](adr/0003-no-notes-app-integrations.md) | ✅ |
| 4 | Sign in with Apple | ~~Not required if magic-link is the only auth~~ → **Required.** Google Sign-In shipped, and guideline 4.8's alternative must let users keep their email private, which an emailed code cannot. All three are wired; Apple is iOS-only — [auth.md](auth.md) | ✅ |
| 6 | Web | Marketing page only in Rollout 1 — no Expo Web. Rollout 2 adds a separate server-rendered read surface, which is not this | Phase 6 |

---

## 7. Risks

| Risk | Mitigation |
|---|---|
| "Connect your notes app" is undeliverable as pitched | Dropped, not reframed — ADR 0003. Capture is composer + share sheet + URL scheme, with markdown folders in Phase 5. Store copy says "one tap from anywhere" and never "auto-sync" |
| Follow-through becomes a to-do list | The review card has **four** answers including "let go". No due dates, no overdue red badges, no streaks. Guilt is the failure mode |
| Sync eats the project | It is Phase 4, behind a working app. If it slips, you still have something shippable |
| SDK 57 / library versions in the stack doc are stale by ship time | Pin versions in Phase 0, upgrade deliberately once, mid-Phase-4 |
| Notes-app market is brutal | The wedge is not capture, it is resurfacing. If Phase 3 doesn't feel different, stop and rethink before Phase 4 |

---

## 8. First week, concretely — done

Phase 0 is complete. All of the below shipped in `689c373`:

1. ~~Spike Legend-State persistence, decide §0.2~~ → deferred deliberately, ADR 0001
2. ~~Decide §0.3 and write it into the README~~ → ADR 0002, in the README
3. ~~`create-expo-app`, monorepo, NativeWind, expo-router, CI~~
4. ~~Drizzle schema from §2, migration applied~~ → `supabase/migrations/20260726000000_init.sql`
5. ~~Composer screen that saves to local storage and survives an app restart~~

Item 5 was the whole thing in miniature. **Next up is Phase 1**, and its exit criterion is the
real gate on the entire plan: *use it as your own daily notes app for a week without reaching for
another app.* Nothing after it is worth building if that fails.
