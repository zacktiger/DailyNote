# Accounts

Three ways in, one account. Google, an emailed six-digit code, and Sign in with Apple.

**Notes never require any of this.** Writing, editing, notebooks, the review loop, locking and
Recently deleted all work with no account and no network, forever. The app asks for an account at
exactly one moment: when you try to put something where other people can read it. A build with no
credentials compiled in still launches, still takes notes, and still reads the feed — it just
cannot sign anybody in.

## Why these three

| | Why it exists |
|---|---|
| **Google** | What people on Android will actually use |
| **Email code** | The escape hatch for anyone who does not want Google holding the relationship |
| **Apple** | Required by App Store guideline 4.8 once Google ships. Wired now, shown on iOS only |

Guideline 4.8 says that if you use a third-party login to set up a primary account, you must also
offer another service that limits collection to name and email, **lets the user keep their email
address private**, and does not harvest in-app activity for ads. An emailed code fails the middle
test — the whole mechanism is that we receive the address — so it does not discharge 4.8 on its
own. Sign in with Apple does. This supersedes decision 4 in [plan.md](plan.md), which was correct
while magic-link was the only option.

Apple is hidden on Android by `canUseApple` in `src/lib/auth-providers.ts`. It works there through
a web redirect, but until an iOS build ships nobody has an Apple identity to come back to. When
iOS lands, that constant is the only thing to change.

**No passwords, anywhere.** A six-digit code means nothing to breach, no reset flow to build, and
no credential to store. A code rather than a magic link because a link is mail app → browser →
deep link back into the app, and that handoff fails often enough to lose people.

## Setup

Four things, in this order. Nothing below is inferable from the repo — it all lives in consoles.

### 1. Supabase

Create a project, then apply the schema:

```bash
supabase link --project-ref <ref>
supabase db push          # applies supabase/migrations/, including the social tables
```

Take the project URL and the **anon** key from Project Settings → API.

### 2. Google

In the [Google Cloud console](https://console.cloud.google.com/apis/credentials), create OAuth
client IDs under one project:

- **Web application** — this is the one the app and Supabase both need. Copy its client ID and
  secret into Supabase → Authentication → Providers → Google.
- **Android** — package name `com.zacktiger.dailynote`, plus the SHA-1 of the signing certificate.
  You need two of these eventually: your EAS debug keystore and your Play upload key. Get the
  fingerprint with `eas credentials`. This client is never named in the code — Google matches it
  by package name and fingerprint.

> The single most common failure is putting the Android client ID in `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`.
> It must be the **web** client ID: that is the audience Supabase validates the token against. The
> symptom is a successful Google sheet followed by "Google did not return a token".

### 3. Apple — only when you ship iOS

Enable Sign in with Apple on the App ID, create a Services ID and a signing key, and put the key
into Supabase → Authentication → Providers → Apple. Skip this entirely for an Android-only launch;
the code path is already there.

### 4. Environment

Create `apps/mobile/.env.local` (git-ignored):

```bash
EXPO_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon key>
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=<web client id>.apps.googleusercontent.com
```

`EXPO_PUBLIC_` variables are compiled into the bundle and are **not secret** — the anon key is
designed for this and is protected by row-level security, and a public OAuth client ID is public by
definition. Never add a service-role key here.

Then rebuild. Google Sign-In is native code, so Expo Go cannot run it:

```bash
npx expo prebuild --clean
npx expo run:android          # or: eas build --profile development --platform android
```

## Turn on identity linking before launch

Supabase → Authentication → Settings → **automatically link identities with matching, verified
emails**.

Without it, somebody who signs up with Google as `you@gmail.com` and later types that same address
into the email form gets a *second* `auth.users` row — a different account, with none of their
published work. It looks to them like their profile vanished. This is cheap to enable now and
expensive to reconcile later.

## What the app does with an account

Almost nothing, and deliberately.

- `profiles.id` **is** `auth.users.id`. The profile is the account wearing a face; there is no
  second identity to reconcile and no local id to remap when sync lands.
- **The handle is never derived from the provider.** Google hands over a real name and an email;
  neither is used to prefill anything. Decision 7 in
  [plan-rollout-2.md](plan-rollout-2.md) allows pseudonymous accounts on purpose, and autofilling
  a real name would quietly convert this into a real-name network.
- Signing out leaves every note on the device. Notes were never the account's.

## Still to do

- **Sync.** Signing in gives an account but notes are still local-only; Rollout 1 Phase 4 is what
  connects them, and it is what makes `auth.users.id` on a note row mean anything.
- **Account deletion.** Guideline 5.1.1(v) requires in-app deletion, and
  [plan-rollout-2 section 5](plan-rollout-2.md) requires that it really remove published content.
  Neither exists yet.
- **Rate limiting** on code sends, beyond whatever Supabase does by default.
