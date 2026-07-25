# ADR 0002 — No end-to-end encryption

**Status:** Accepted
**Date:** 2026-07-26

## Context

Plan §0.3: server-side AI features (pgvector, full-text search in Postgres) require plaintext on
the server. E2EE and those features are mutually exclusive, permanently — not "later". For an app
whose pitch is "put your private daily notes here", this is a trust decision, and retrofitting
E2EE onto a synced note store is a rewrite.

## Decision

**No end-to-end encryption.** Notes are encrypted in transit and at rest, and are readable by the
server.

Three things make this an honest trade rather than a quiet one:

1. A per-note **`local_only`** flag. Those notes never leave the device — enforced by excluding
   them from the outbound sync set, not by RLS. This is the pressure valve for anything genuinely
   sensitive.
2. The privacy position is stated plainly in onboarding, not buried in a policy.
3. The server is open source (AGPL, see [ADR 0004](0004-licensing.md)) with self-host docs. That
   is the credibility substitute for E2EE.

## Consequences

- Server-side search and semantic features stay viable for Phase 5 and Rollout 2.
- We cannot claim "we can't read your notes." We must not imply it either — in store copy, in
  onboarding, or in the README.
- `local_only` must be tested explicitly when sync lands in Phase 4. A local-only note appearing
  in the outbound set is the single worst bug this app can ship.
- Crash reporting is opt-in and analytics are absent or opt-in and self-hosted. Silent telemetry
  in a private notes app is a credibility loss that cannot be bought back.

## Alternative rejected

Full E2EE. It kills server-side search and semantic features entirely. Only correct if privacy is
the wedge — and the wedge here is resurfacing, not privacy.
