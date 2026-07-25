# supabase

Migrations and RLS policies. **Nothing in Rollout 1 Phase 1–3 touches this** — the app is
local-only until Phase 4. It is here now so the schema is settled before it has data in it.

## Setup

```bash
npm i -g supabase        # or: brew install supabase/tap/supabase
supabase init            # generates config.toml (not committed yet)
supabase start           # local Postgres + auth on Docker
supabase db reset        # applies everything in migrations/
```

## Workflow

Schema changes are authored in `packages/db/src/schema.ts`, not here:

```bash
npm run db:generate      # drizzle-kit writes SQL into migrations/
supabase db reset        # apply locally
```

Hand-written SQL is only for things Drizzle does not model: RLS policies, triggers, and
functions. Those live in `20260726000000_init.sql` and should be moved to their own migration
when they change.

## Notes

- `updated_at` is trigger-maintained, deliberately. It is the sync cursor, so it cannot be
  trusted from a client with a skewed clock.
- There is no `public` read policy. Do not add one speculatively — the Rollout 2 feed goes
  behind an API, not in RLS.
