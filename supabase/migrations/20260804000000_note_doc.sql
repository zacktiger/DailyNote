-- Rich text: the block document.
--
-- `body` stays exactly what it was -- the plain text of the note, and what
-- search, `#hashtag` parsing, `title` derivation and the Phase 4 sync cursor
-- read. `doc` is the structured source it is projected from: paragraphs,
-- bullets, alignment and local image references, serialized by
-- @dailynote/core's document module.
--
-- Nullable, and no backfill: a null `doc` means a plain-text note, which is
-- every note written before this migration. The client reads those as a
-- document of paragraphs, so nothing needs rewriting.

alter table notes add column if not exists doc text;
