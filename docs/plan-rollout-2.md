# Implementation Plan — Rollout 2: the social layer

**Goal:** published notes that other people can read, respond to, and follow — without the app
stopping being a notes app.
**Prerequisite:** Rollout 1 Phase 4 (accounts and sync). Nothing here works offline-only.

---

## Status — 2026-08-04

The in-app half of R2.0, R2.1 and R2.2 is built, plus direct posting, which this plan did not
have. Two departures from what is written below, both deliberate:

1. **Direct posting is in.** Section 1's "it is not a status feed" and section 7's "if you ever
   add a 'what's happening?' box, you have lost" are superseded — see the amendment note in
   [product.md](product.md). The guard that survived is structural: two composers on two tabs, and
   the note composer has no social affordance on it.
2. **It runs against local storage, not a server.** `apps/mobile/src/db/social-repo.ts` is the
   seam; every social read and write in the app is one of its methods. Swapping to Supabase plus
   the Hono worker described below means reimplementing that one file. Until then
   `apps/mobile/src/lib/social-seed.ts` stands in for other users, and it is deleted — not
   adapted — when the server exists.

Built: profiles and handles with a reserved list · publish and unpublish a note · post straight to
the feed · chronological following/everyone feed · follows · one reaction · view counts · block ·
report. `supabase/migrations/20260804200000_social.sql` is the server schema and is not yet
applied anywhere.

Not built: the Hono web surface and public URLs that render without an install (the links the app
shows are addresses the server will honour, not pages that exist yet) · comments · push
notifications · themes · discovery · an admin queue for the reports table.

---

## 0. The three questions you asked

### Platform: stay mobile, add a read-only web surface

Mobile-first is right and you are already committed — Expo, one codebase, both platforms.
Do not reconsider it.

But **a social app needs public URLs that work without an install.** If someone shares a note and
the link opens an App Store page, the share is dead. That is the single most common way a
mobile-only social product fails to spread.

So: **the app is mobile, the reading surface is web.** A public note gets a real URL that renders
server-side as HTML — fast, linkable, indexable, no install. Writing, following, commenting: app
only, at least through Rollout 2.

This is *not* Expo Web. Rollout 1 decision 6 already rejected shipping the React Native app to the
browser, and that still holds — it would be a slow, weird-feeling read surface. This is a separate,
tiny server-rendered site.

### Stack: keep Rollout 1's, add exactly one thing

| Concern | Choice | Why |
|---|---|---|
| App | Expo + expo-router (existing) | already built |
| Auth, DB, storage | Supabase (existing) | already schemed |
| Private notes | RLS, `auth.uid() = user_id` (existing) | already written, stays trivial |
| **Feed, profiles, comments** | **Hono on Cloudflare Workers** | new |
| Public note pages | Same Hono app, server-rendered | no second framework |
| Push notifications | Expo Push | Rollout 1 was local-only |

**One rule, and it is the important one: no feed logic in RLS.**

Rollout 1's policy set is four lines and correct. The instant you try to express "notes from people
I follow, excluding people I blocked, unless unlisted" as a Postgres policy you get recursive
policies that are slow, impossible to test, and terrifying to change. Social reads go through the
API with a service role, which does the authorization in code you can read and unit test.

This is already written down in [plan §5](plan.md) — it is the seam Rollout 1 was built to protect.
Do not spend it.

### Approach: publishing is a second, deliberate act

The thing that decides whether this works:

> **The composer must never ask who will see this.**

Notes are private. Publishing is a separate action on a note that already exists. Not a toggle in
the composer, not a default, not a nudge. The moment capture becomes performance, it stops being a
notes app, and the notes app is what makes the social layer worth anything.

You said the main component is note taking. That is correct and it is a structural claim, not a
priority one: Rollout 1 works completely with the network off, and Rollout 2 is a publish button
over a data structure that already exists.

---

## 1. What this is, and what it is not

> A place where the small things you wrote down come back to you, and the ones worth sharing
> become a public record of what you actually followed through on.

**It is not a status feed.** The published unit is a **thread** — a commitment plus the record of
acting on it — not a post. This was the whole reason threads were built in Rollout 1 Phase 3.

The design consequence is the most valuable idea in this document:

> **The feed's unit is a thread that changed, not a note that was created.**

When someone posts "I'm going to learn Rust", that is a tweet and it is worthless. When the same
thread surfaces six weeks later carrying *"Done — here's what I built"*, that is something nobody
else has. The follow-through loop is the differentiator in Rollout 1 and it is the differentiator
here too. Everything else — likes, follows, views — is table stakes you build because their absence
is conspicuous, not because they are the product.

**On the Substack comparison:** Substack is long-form, email-delivered and subscription-shaped.
Almost none of that transfers. What does transfer is *one author, followed deliberately, low
volume, no algorithm*. Take that. Leave the newsletter, the paywall and the essay length.

---

## 2. Data model additions

Rollout 1 already ships `visibility`, `published_at` and stable client-generated UUIDs, so nothing
below is a migration of existing rows.

```sql
create table profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  handle       citext not null unique,          -- @handle, 3-30 chars
  display_name text,
  bio          text,
  avatar_url   text,
  created_at   timestamptz not null default now(),
  constraint handle_format check (handle ~ '^[a-z0-9_]{3,30}$')
);

create table follows (
  follower_id uuid not null references profiles(id) on delete cascade,
  followee_id uuid not null references profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (follower_id, followee_id),
  constraint no_self_follow check (follower_id <> followee_id)
);

create table comments (
  id         uuid primary key,
  root_id    uuid not null references notes(id) on delete cascade,  -- the thread
  parent_id  uuid references comments(id) on delete cascade,        -- one level of nesting
  author_id  uuid not null references profiles(id) on delete cascade,
  body       text not null,
  created_at timestamptz not null default now(),
  deleted    boolean not null default false
);

create table reactions (
  note_id    uuid not null references notes(id) on delete cascade,
  user_id    uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (note_id, user_id)      -- one kind only; see decision 3
);

-- Safety. Not optional, see section 5.
create table blocks (
  blocker_id uuid not null references profiles(id) on delete cascade,
  blocked_id uuid not null references profiles(id) on delete cascade,
  primary key (blocker_id, blocked_id)
);

create table reports (
  id          uuid primary key,
  reporter_id uuid references profiles(id) on delete set null,
  note_id     uuid references notes(id) on delete cascade,
  comment_id  uuid references comments(id) on delete cascade,
  reason      text not null,
  status      text not null default 'open'
                check (status in ('open', 'actioned', 'dismissed')),
  created_at  timestamptz not null default now()
);
```

Additions to `notes`:

```sql
alter table notes add column slug text;              -- /@handle/slug, unique per user
alter table notes add column view_count int not null default 0;
create unique index notes_user_slug_idx on notes (user_id, slug) where slug is not null;
```

Notes on the model:

- **Views are a counter on the row, not a table.** Per-view rows are the fastest way to a table with
  a hundred million rows that nobody queries. Increment periodically from the API.
- **Comments attach to `root_id`, the thread — not to individual updates.** One conversation per
  thread. Threading comments *inside* a threaded note is a UI nobody has ever made legible.
- **One level of comment nesting.** Not zero (replies are needed), not unbounded (that is Reddit,
  and it is a different product).
- **`local_only` notes must be structurally impossible to publish.** Add a check constraint:
  `local_only = false or visibility = 'private'`. Rollout 1's ADR 0002 makes this flag the entire
  privacy pressure valve; it needs a database guarantee, not a code path.

### RLS stays simple

Keep Rollout 1's own-rows policies untouched. Add exactly one read policy:

```sql
create policy public_notes_readable on notes
  for select using (visibility = 'public' and deleted = false);
```

That is it. Blocks, follows, feed composition and muting are **API concerns**, enforced in Hono.
The database answers "is this row public"; it does not answer "should this person see this now".

---

## 3. Phases

One person, part-time. Rollout 2 is bigger than Rollout 1 — treat the ordering as the output and
the weeks as fiction.

### R2.0 — Identity · ~2 weeks
Everyone has an account by now (R1 Phase 4) but nobody has a face.

- `profiles`: handle, display name, bio, avatar
- Handle claim flow, reserved-name list, format validation
- Profile screen: your notes that are public, follower counts
- Avatar upload to Supabase Storage
- **Exit:** you can claim `@you` and someone can look at your profile

### R2.1 — Publishing and the web surface · ~3 weeks
The first moment content exists outside a device. Safety minimums ship *here*, not later.

- Publish action on a thread: private → public, generates a slug
- Unpublish, and unpublish means gone from the web within seconds
- Hono on Workers, server-rendered `/@handle/slug` pages: the root note, its updates in order,
  the follow-through state. No JS required to read one
- OG tags so shared links unfurl
- **Minimum safety: a report link on every public page, a terms/contact page, and a takedown
  procedure you have actually tested**
- **Exit:** you publish a thread, send the URL to someone with no app, and it reads well

### R2.2 — The graph and the feed · ~3 weeks
- Follow / unfollow, follower and following lists
- **Following feed, reverse chronological, no algorithm** (see decision 2)
- **Feed entries are thread events, not note creations**: published, updated, completed. A thread
  you followed six weeks ago reappearing with "Done" is the product working
- Expo Push for follows and, later, comments
- **Exit:** your feed shows you someone else's follow-through and it feels good to see

### R2.3 — Conversation and full safety · ~3 weeks
- Comments on threads, one level of nesting
- Reactions
- **Block, mute, in-app report queue, and an admin surface to action reports**
- Per-note comment setting: everyone / followers / off
- **Exit:** a stranger comments, and you can block them in two taps

### R2.4 — Customization · ~2–3 weeks
The Mihon-flavoured part. See section 4 — read it before starting, the model matters.

- Theme engine over the existing design tokens
- Bundled themes, light and dark
- User-authored themes as importable/exportable JSON
- Custom wallpaper behind the composer and lists
- Font choice, type scale, note density
- **Exit:** someone posts a theme file in an issue and you can use it without a release

### R2.5 — Discovery · ~2–3 weeks
Deliberately last. A discovery surface built before there is anything to discover is a ghost town
that teaches you nothing.

- A **"followed through"** surface: recently completed threads. On-brand, and it is the only
  discovery feed that reinforces the thesis instead of diluting it
- Tag pages
- Search across public notes (Postgres FTS — this is what ADR 0002 bought)
- **Exit:** you find someone worth following without being told about them

**Total: roughly 15–19 weeks part-time**, on top of Rollout 1's 9–11.

---

## 4. Customization: declarative only

You cited Mihon, and the instinct is right — extensible theming is a real reason people love an
open-source app and it costs you little.

But Mihon can load third-party **code** because it is sideloaded and F-Droid-distributed. **You
cannot.** Two reasons, both hard:

1. **This app holds private notes.** A theme that can execute code can read them. That is not a
   theoretical risk, it is the whole trust model of the product.
2. **App Store rule 2.5.2** forbids downloading and executing code. An extension system is a
   rejection, not a negotiation.

So: **themes are data, never code.**

```jsonc
{
  "name": "Solarized",
  "colors": { "paper": "#fdf6e3", "ink": "#073642", "muted": "#93a1a1",
              "line": "#eee8d5", "accent": "#268bd2" },
  "font": "serif",
  "density": "comfortable"
}
```

The seam already exists. `apps/mobile/tailwind.config.js` defines semantic tokens — `paper`, `ink`,
`muted`, `line`, `accent` — rather than literal colours, and every screen already uses them. Making
those runtime-swappable is a contained change, *provided nobody introduces a hardcoded hex between
now and then.* That is worth a lint rule.

Wallpapers are user-selected local images with an opacity control. Nothing downloads.

---

## 5. Safety and moderation: the thing that will actually block your launch

This is the part people skip and it is the part that gets apps rejected.

**Apple App Store Review Guideline 1.2** requires *all* of the following before a user-generated
content app ships:

1. A method for filtering objectionable material
2. A mechanism for users to report offensive content
3. A mechanism to block abusive users
4. Published developer contact information
5. **Acting on reports within 24 hours**, including removing content and ejecting the user

Google Play's UGC policy is close to identical. **You cannot ship a social app without these**, and
they are not a phase-6 polish item — item 5 is an operational commitment you are making as a person,
not a feature you build.

Practical consequences:

- Minimum viable safety ships in **R2.1**, the moment anything is publicly readable.
- You need a real contact address and a real terms/privacy page before the first public note.
- Budget for the fact that you are now on the hook to check a report queue daily.
- Age rating goes up. UGC apps get 12+ minimum, often 17+.

Also required, and cheap if done early:

- **An explicit content licence in your terms.** Who owns a published note? (Recommendation: the
  author keeps ownership and grants you a licence to display it. Say so plainly.)
- **Deletion means deletion.** A user deleting their account must remove public content. Rollout 1's
  soft-delete model needs a real hard-delete path for this.
- **Impersonation:** the reserved-handle list from R2.0 is your first line.

---

## 6. Open decisions

Ordered by cost of deferring.

| # | Decision | Recommendation | Deadline |
|---|---|---|---|
| 1 | Does publishing cannibalize the notes app? | Watch it. If your own private-note volume drops after R2.1, the composer is leaking social pressure — fix that before continuing | R2.1 |
| 2 | Feed algorithm | **Chronological, following-only.** No ranking. It is honest, it is cheap, and ranking is how this becomes a product you did not want to build | R2.2 |
| 3 | Reaction types | **One.** Not six. A single ambiguous positive signal avoids the entire question of what a 😂 means on a note about a dead relative | R2.3 |
| 4 | Comment permissions | Per-note: everyone / followers / off. Default followers | R2.3 |
| 5 | Web framework | **Hono SSR, no client framework.** These are read-only documents; shipping React to render a note is silly | R2.1 |
| 6 | Handle namespace | Global, `[a-z0-9_]{3,30}`, with a reserved list (admin, support, help, api, about, terms…) | R2.0 |
| 7 | Anonymous / pseudonymous accounts | Allow. Real-name policies do not improve behaviour and this product benefits from people admitting things | R2.0 |
| 8 | Monetization | **Not in Rollout 2.** Decide it when there are users, not before | — |
| 9 | Federation (ActivityPub) | **No.** Enormously appealing, enormously expensive, and it would make moderation someone else's problem in the worst way | — |

---

## 7. Risks

| Risk | Mitigation |
|---|---|
| **It becomes a worse Twitter** | The published unit is a thread with follow-through state, not a post. If you ever add a "what's happening?" box, you have lost |
| **The social layer kills the notes app** | Private by default, publishing is a separate deliberate act, composer never mentions audience. Measure your own private-note volume |
| Empty-room problem | Do not launch the feed to nobody. R2.1 (publish + share a link) works with zero other users — that is deliberate, it is how the first hundred notes get written |
| Moderation burden | Section 5. Budget real time, not zero |
| Scope: R2 is bigger than R1 | R2.1 is independently shippable and useful. If everything after it slips a year, you still have a notes app with shareable pages |
| Open source + social = someone forks a hostile instance | AGPL on the server (ADR 0004) means their changes stay open. It does not stop them; nothing does |
| Handle squatting at launch | Reserved list, and rate-limit claims |

---

## 8. If you only do one thing

**Build R2.1 and stop.**

Publishing a thread to a real URL that anyone can read, with no feed, no follows and no comments,
is:

- the smallest thing that makes the app social,
- independently valuable (a private notes app with shareable pages is already good),
- the only part that works with zero other users,
- and a genuine test of whether anyone wants this, before you spend three months on a graph.

Everything after R2.1 assumes people are publishing. Find out whether they are.
