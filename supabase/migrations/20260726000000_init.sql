-- Rollout 1 initial schema.
--
-- The sync columns are here from day one even though sync does not land until
-- Phase 4. That is what makes Phase 4 wiring instead of migration.

create table if not exists notes (
  id            uuid primary key,
  user_id       uuid references auth.users(id) on delete cascade,
  body          text not null,
  title         text,

  -- threading / follow-through
  root_id       uuid not null,
  parent_id     uuid references notes(id) on delete set null,
  kind          text not null default 'note',

  -- review engine
  next_review_at   timestamptz,
  review_interval  int,
  review_count     int not null default 0,
  archived_at      timestamptz,
  completed_at     timestamptz,

  -- provenance
  source        text not null default 'composer',
  source_ref    text,

  -- publishing: DB-enforced even though nothing publishes yet
  visibility    text not null default 'private',
  published_at  timestamptz,
  local_only    boolean not null default false,

  -- sync
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted       boolean not null default false,

  constraint notes_kind_check       check (kind in ('note', 'update')),
  constraint notes_source_check     check (source in ('composer', 'share', 'shortcut', 'import', 'clipboard')),
  constraint notes_visibility_check check (visibility in ('private', 'unlisted', 'public')),
  constraint private_is_unpublished check (visibility <> 'private' or published_at is null)
);

create table if not exists tags (
  id      uuid primary key,
  user_id uuid references auth.users(id) on delete cascade,
  name    text not null,
  constraint tags_user_name_unique unique (user_id, name)
);

create table if not exists note_tags (
  note_id uuid not null references notes(id) on delete cascade,
  tag_id  uuid not null references tags(id) on delete cascade,
  primary key (note_id, tag_id)
);

-- The sync pull: everything of mine that changed since the last sync.
create index if not exists notes_user_updated_idx on notes (user_id, updated_at);
-- The Today screen: my open commitments that have come due.
create index if not exists notes_user_review_idx  on notes (user_id, next_review_at);
-- Thread assembly.
create index if not exists notes_root_idx         on notes (root_id);

-- ---------------------------------------------------------------------------
-- updated_at trigger
--
-- Maintained server-side rather than trusted from the client: Legend-State's
-- `changesSince: 'last-sync'` uses this column as the sync cursor, so a client
-- with a skewed clock could otherwise write rows that never sync down again.
-- ---------------------------------------------------------------------------

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists notes_set_updated_at on notes;
create trigger notes_set_updated_at
  before update on notes
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Row level security
--
-- This is the entire policy set for Rollout 1. There is no public read path,
-- because there is no publishing yet -- the safest publish path is the one that
-- does not exist. When the feed arrives it goes behind an API, not in RLS.
-- ---------------------------------------------------------------------------

alter table notes     enable row level security;
alter table tags      enable row level security;
alter table note_tags enable row level security;

create policy own_notes on notes
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy own_tags on tags
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy own_note_tags on note_tags
  for all
  using (
    exists (select 1 from notes n where n.id = note_tags.note_id and n.user_id = auth.uid())
  )
  with check (
    exists (select 1 from notes n where n.id = note_tags.note_id and n.user_id = auth.uid())
  );
