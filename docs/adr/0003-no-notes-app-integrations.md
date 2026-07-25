# ADR 0003 — No notes-app integrations in Rollout 1

**Status:** Accepted
**Date:** 2026-07-26

## Context

The original pitch was "connect it to your local notes app and your notes get regularly
uploaded." Plan §0.1 establishes that this is not buildable as described:

| Source | Programmatic read? | Reality |
|---|---|---|
| Apple Notes (iOS) | No | No public API, no share extension *out*, no on-disk format. AppleScript is macOS-only. |
| Google Keep | No | No public API. `keep.googleapis.com` is Workspace-admin-only and cannot read consumer notes. |
| Samsung Notes / MIUI Notes | No | Proprietary, no exported API. |
| Obsidian / Markdown vault | Yes | Plain files in a folder. |
| Any app | Yes, user-initiated | Share sheet. |

The plan proposed working around this with an iOS Shortcuts recipe — Shortcuts can read Apple
Notes even though we cannot — giving "Apple Notes ingestion by proxy."

## Decision

**Drop notes-app integration from Rollout 1 entirely**, including the Shortcuts workaround.
There is no API to connect to, so there is nothing to build against.

Capture in Rollout 1 is:

- the composer (the launch screen), and
- Phase 2 capture surfaces: the share sheet and the `notes://` URL scheme.

Neither is an integration with another notes app. Both are user-initiated, work everywhere, and
depend on no third party's API surface.

The Shortcuts recipe (plan §0.1 item 2) is **not dropped on technical grounds** — the deep-link
half is ~20 lines and lands in Phase 2 anyway. It is dropped as a *promise*: shipping a recipe
means owning it when Apple changes Shortcuts. Revisit after Phase 2, once the URL scheme exists
and the recipe is a documentation task rather than a feature.

Markdown folder sync (Android SAF) stays in Phase 5. A folder of files is not an API, and
Obsidian users are a real target.

## Consequences

- **Store copy must never promise "auto-sync with your notes app."** Promise "one tap from
  anywhere." That is deliverable and honest.
- Phase 2 shrinks: share sheet plus URL scheme, no recipe to write and test.
- The `source` column already distinguishes `composer` / `share` / `shortcut` / `import` /
  `clipboard`, so nothing in the schema changes if a shortcut path is added later.
