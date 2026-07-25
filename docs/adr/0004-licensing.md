# ADR 0004 — Licensing

**Status:** Accepted
**Date:** 2026-07-26

## Context

Plan §6, decision 3, due in Phase 0. The Rollout 2 social feed is the part with competitive
value; the client is the part people should be able to fork, audit and self-host.

## Decision

Split licences:

- **`apps/mobile`, `packages/core` — MIT.** Trivially forkable. Someone who wants to build their
  own client on the same domain logic should not have to think about it.
- **`packages/db`, `supabase`, and any future server — AGPL-3.0-or-later.** The AGPL is what
  stops a Rollout-2 feed from being lifted as a closed SaaS.

Repository root carries the MIT text (it is what most of the tree is); AGPL-covered packages
declare it in their own `package.json` `license` field.

## Consequences

- Contributors need to know which half they are touching. `CONTRIBUTING.md` says so.
- A single `LICENSE` file at root would be misleading once a server exists. When
  `apps/server` lands, add `apps/server/LICENSE` with the AGPL text.
- AGPL on the DB package is mostly symbolic today — it is schema and migrations. It matters
  because the server will grow from it.
- F-Droid (plan Phase 6) is unaffected: the client is MIT and dependency-clean.
