# Architecture decision records

One file per decision that was expensive to make or would be expensive to reverse. If you find
yourself re-arguing something, it belongs here.

Product-level decisions — what is in and what is out — live in [product.md](../product.md), not
here. These are the technical ones.

| # | Decision | Status |
|---|---|---|
| [0001](0001-local-storage-shape.md) | Local storage shape — relational SQLite behind a repository interface | Accepted for Phase 1–3; §0.2 deferred to Phase 4 |
| [0002](0002-no-end-to-end-encryption.md) | No end-to-end encryption; `local_only` flag as the pressure valve | Accepted |
| [0003](0003-no-notes-app-integrations.md) | No Apple Notes / Google Keep integration — no API exists | Accepted |
| [0004](0004-licensing.md) | MIT for the app and core, AGPL-3.0 for the DB and server | Accepted |

Settled outside the ADR set:

| # | Decision | |
|---|---|---|
| 5 | Name and bundle ID — **DailyNote**, `com.zacktiger.dailynote`, scheme `dailynote://` | ✅ resolved by the repo name |

Still open, from [plan §6](../plan.md):

| # | Decision | Deadline |
|---|---|---|
| 4 | Sign in with Apple — not required if magic-link is the only auth | Phase 4 |
| 6 | Web — marketing page only, no Expo Web in Rollout 1 | Phase 6 |
