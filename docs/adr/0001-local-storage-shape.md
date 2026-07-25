# ADR 0001 — Local storage shape

**Status:** Accepted for Phase 1–3. The A-vs-B question from plan §0.2 is deferred to Phase 4.
**Date:** 2026-07-26

## Context

Plan §0.2 flags a probable conflict: "expo-sqlite as source of truth" and "Legend-State
persistence" may not be compatible, because Legend-State's persistence plugins are key-value and
may store one JSON blob rather than relational rows. If that holds, there is no local SQL and no
FTS5. The plan calls it "the only decision in the stack that is expensive to reverse" and asks
for a day-one spike, recommending **option A** (Legend-State owns storage).

The spike needs a device or simulator and has not been run.

## Decision

Do not couple storage to the sync library yet.

Rollout 1 Phase 1–3 uses **real relational SQLite tables** via `expo-sqlite`, reached only
through the `NotesRepo` interface in `apps/mobile/src/db/notes-repo.ts`. Legend-State is not a
dependency yet — it does not need to be, because Phase 1–3 has no network, no account and no
sync.

## Consequences

This makes §0.2 cheap to reverse instead of expensive, which was the actual goal of deciding it
early:

- **If the spike later shows blob storage (plan's option A):** Legend-State becomes an
  observable cache layered over `NotesRepo`, or replaces its implementation. Either way the
  change is confined to one file, because every read path in the app goes through the interface.
- **If it shows relational tables (option B):** we are already there, and FTS5 is available for
  free whenever JS filtering stops being fast enough.

Costs of this choice:

- ~150 lines of repository and row-mapping code that option A would have avoided.
- A hand-written migration runner (`src/db/migrations.ts`, tracked with `pragma user_version`).
- The full sync column set is carried locally but unused until Phase 4.

Search is JS filtering over an in-memory array today (`searchNotes` in `@dailynote/core`), matching
the plan's option-A ceiling of roughly 10–20k notes. Swapping it for FTS5 means rewriting one
function.

**Run the spike before Phase 4, not before Phase 1.** By then it is a question about the sync
library, which is when it actually matters.
