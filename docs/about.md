# The longer version

The friendly explanation. For what the product *is* as a set of decisions —
what's in, what's out, and which rules are not up for renegotiation — see
[product.md](product.md), which is the authoritative one.

## Why a note that comes back

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

The intervals are a loose ladder — **+2d → +7d → +21d → +60d** — and answering *Not yet* pushes it
along. Tags are inline `#hashtags` parsed out of what you wrote; there's no tag picker. Writing
`#do` promotes a note to a commitment, the same as tapping **Follow up**.

## The sharing part

Some of what you write turns out to be worth showing people. A thing you said you'd learn, and
then did. A project that went somewhere.

So there's a **Feed**. You can publish a note you already wrote, or write a post straight to the
feed if that's what you feel like. You can read what other people have shared, follow the ones
worth following, and block or report the ones that aren't.

Two promises about it:

- **Your notes are private and stay that way.** Publishing is something you choose, note by note,
  afterwards. Nothing you write is public unless you say so.
- **You never have to.** No account is needed to write notes. If you never publish anything, you
  haven't missed out on anything — you just have a notes app, which is the point.

The writing screen never asks who's going to see it. Posting lives on its own tab, behind its own
composer, and tells you it's public before you type a word. That separation is structural, not a
matter of taste — see rules 1 to 3 in [product.md](product.md).

## What makes it different

Most feeds are full of people saying what they're *about* to do. "I'm going to learn Rust" is easy
to post and worth nothing.

Here, the thing that appears in the feed is a **thread**: the original note, plus what actually
happened to it over time. Feed order is by last activity rather than by creation date, so a thread
resurfacing six weeks later carrying *"Done — here's what I built"* comes back to the top. That's
something no other feed has, and it's why threads were built before publishing was.

Follow-through is the whole product, pointed inward first and outward second.

## Accounts

You don't need one to write notes, and you never will — that isn't a trial tier, it's the design.

An account is asked for at exactly one moment: when you want to put something where other people
can read it. Three ways in, all landing on the same account:

- **Google**
- **A six-digit code by email** — no password, so there's nothing to forget and nothing to leak
- **Sign in with Apple** — on iOS

Your handle is separate from how you signed in, and is never prefilled from it. Pseudonymous
accounts are allowed on purpose. Signing out leaves every note exactly where it is; they were
never the account's.

Setting this up for your own build: [auth.md](auth.md).

## Privacy, and the trade behind it

**This app does not use end-to-end encryption, and the server can read your notes.** Notes are
encrypted in transit and at rest. Any note can be marked **local-only**, and those never leave your
device: publishing one is refused in code, and the server schema carries a constraint that makes a
published local-only note impossible to store at all.

That's deliberate. End-to-end encryption would permanently rule out server-side search, which is a
feature worth more here than a guarantee we'd then have to work around. The whole server is open
source and self-hostable, which is our substitute for "trust us." The reasoning is written up in
[ADR 0002](adr/0002-no-end-to-end-encryption.md).

There's also **no integration with Apple Notes or Google Keep**. Neither has an API to build
against, so it's dropped rather than promised ([ADR 0003](adr/0003-no-notes-app-integrations.md)).
Capture is the composer, the share sheet, and a `dailynote://` link.
