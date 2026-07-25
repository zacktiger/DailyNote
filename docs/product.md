# The product

The current definition. [plan.md](plan.md) and [plan-rollout-2.md](plan-rollout-2.md) say how it
gets built; this says what it is. When the two disagree, this one is right and the plan is stale.

---

## One sentence

> A private notes app where a note you wrote once comes back to you at the right time and asks
> whether anything came of it — and the ones worth sharing become a public record of what you
> actually followed through on.

## The shape of it

**Note-taking is the product.** Not "note-taking plus social" as equal halves — note-taking is the
thing, and the social layer is a second, optional act performed on notes that already exist.

The test is structural, not a matter of emphasis:

- The app is **complete and worth using with the network off, forever, with no account.** That is
  Rollout 1, and it is not a demo or a trial tier.
- Publishing, likes, views and followers are **real features and genuinely part of the product** —
  their absence would be conspicuous. But every one of them operates on a note that was written
  privately first.
- If you never publish anything, you have lost nothing. If you only publish, you are using it
  wrong and the app should not be nudging you there.

Three rules that keep it that way:

1. **The composer never asks who will see this.** No audience selector, no visibility toggle, no
   "share to feed" checkbox. The moment capture becomes performance it stops being a notes app,
   and the notes app is what makes the social layer worth anything.
2. **Private is the default and it is not a setting you can accidentally flip.** Publishing is a
   deliberate action on an existing note, taken later.
3. **The published unit is a thread, not a post.** A thread is a commitment plus the record of
   acting on it. There is no "what's happening?" box, ever.

## What's in

| | | Rollout |
|---|---|---|
| Fast capture, composer as launch screen | core | 1 |
| Inline `#hashtag` tags, search, export to markdown | core | 1 |
| Share sheet and `dailynote://` URL scheme | core | 1 |
| **The follow-through loop** — commitments, resurfacing, the four-answer review card | **the differentiator** | 1 |
| Threads — a note plus its updates over time | core, and the R2 seam | 1 |
| Accounts, sync, multi-device | plumbing | 1 |
| Markdown folder import | expansion | 1 |
| Profiles and handles | social | 2 |
| **Publishing a thread to a public URL that reads without an install** | **the social wedge** | 2 |
| Followers, chronological feed, likes, view counts | social, table stakes | 2 |
| Comments, blocks, reports, moderation | social, non-negotiable once public | 2 |
| Themes as data, custom wallpapers | customization | 2 |
| Discovery — "followed through", tag pages, public search | social, last | 2 |

## What's out, and why

| | Why |
|---|---|
| **Reading your Apple Notes / Google Keep** | There is no API. Not deprioritized — not buildable. [ADR 0003](adr/0003-no-notes-app-integrations.md) |
| An iOS Shortcuts recipe as a shipped feature | Same ADR. The `dailynote://` half ships in Phase 2; owning a recipe against Apple's changes is a promise we're not making |
| End-to-end encryption | Rules out server-side search and AI permanently. `local_only` notes are the pressure valve. [ADR 0002](adr/0002-no-end-to-end-encryption.md) |
| A ranked feed | Chronological, following-only. Ranking is how this becomes a product we did not want to build |
| Attachments, images, link unfurling | Text and URLs only through Rollout 1 |
| Executable themes / extensions | A theme that runs code can read your notes. Also App Store 2.5.2 |
| Federation, monetization | Not now. Neither is a Rollout 2 question |

## The two claims this all rests on

**1. The wedge is resurfacing, not capture.** Every notes app has a text box. Nobody has a note
that comes back six weeks later and asks one question. If Rollout 1 Phase 3 doesn't feel different
from Apple Notes, the whole thesis is wrong and no amount of social layer fixes it.

**2. The feed's unit is a thread that changed, not a note that was created.** "I'm going to learn
Rust" is a tweet and it is worthless. The same thread surfacing six weeks later carrying *"Done —
here's what I built"* is something no other feed has. Follow-through is the differentiator in both
rollouts; it is the same mechanism pointed outward.

## How the pitch is allowed to be phrased

Store copy, landing page, anywhere:

- ✅ "Your daily notes, one tap from anywhere." · ✅ "Notes that come back and ask what happened."
- ✅ "Publish the ones worth sharing." · ✅ "Private by default. Works offline. Open source."
- ❌ "Auto-syncs with your notes app." — untrue, see ADR 0003.
- ❌ Anything that leads with the feed. The feed is not the reason to install.

## Failure modes, watched deliberately

| | The tell | The response |
|---|---|---|
| It becomes a to-do list | Due dates, overdue badges, streaks creep in | The review card has four answers including **Let go**. Guilt is the failure mode |
| It becomes a worse Twitter | Anyone proposes a compose-to-feed box | See rule 1 above |
| The social layer eats the notes app | Your own private-note volume drops after R2.1 | Stop and fix the composer before building more of R2 |
| Publishing feels like homework | Nobody publishes, including you | Fine. R2.1 is independently shippable — a private notes app with shareable links is already good |
