-- Rollout 2: the social layer.
--
-- Two things are being added: an identity (profiles), and the ability for a
-- note to be readable by someone other than its author.
--
-- The rule this migration is written to respect, from plan-rollout-2 section 0:
-- **no feed logic in RLS.** The policies below answer exactly one question --
-- "is this row public" -- and nothing else. Following, blocking, muting and
-- feed composition are decided in application code, where they can be read and
-- unit-tested. The moment a policy needs to know who follows whom, it becomes
-- a recursive policy that is slow, untestable and terrifying to change.

-- ---------------------------------------------------------------------------
-- notes: the columns publishing needs
-- ---------------------------------------------------------------------------

alter table notes add column if not exists slug        text;
alter table notes add column if not exists born_public boolean not null default false;
-- A counter on the row, not a table of view events: per-view rows are the
-- fastest route to a hundred-million-row table that nobody ever queries.
alter table notes add column if not exists view_count  int not null default 0;

-- Slugs are unique per author, not globally. Two people may both publish
-- `learning-rust`; the handle in the path is what makes the URLs different.
create unique index if not exists notes_user_slug_idx
  on notes (user_id, slug) where slug is not null;

-- ADR 0002 makes local_only the entire privacy pressure valve. It gets a
-- database guarantee rather than a code path somebody could forget.
alter table notes drop constraint if exists local_only_is_private;
alter table notes add  constraint local_only_is_private
  check (local_only = false or visibility = 'private');

-- A public note has an address. A private one has none to leak.
alter table notes drop constraint if exists published_has_slug;
alter table notes add  constraint published_has_slug
  check (visibility = 'private' or slug is not null);

-- ---------------------------------------------------------------------------
-- Identity
-- ---------------------------------------------------------------------------

-- Keyed by the account id rather than carrying its own, so there is exactly
-- one identity per user and no way to accumulate a second.
create table if not exists profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  handle       text not null unique,
  display_name text,
  bio          text,
  avatar_url   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  -- The format forbids uppercase, so plain text is already case-unique and
  -- citext is not worth an extension.
  constraint handle_format check (handle ~ '^[a-z0-9_]{3,30}$')
);

-- Impersonation is cheapest to prevent before the first claim. This list is
-- the app's own paths plus names that would let someone pass as the app.
create table if not exists reserved_handles (
  handle text primary key
);

insert into reserved_handles (handle) values
  ('about'), ('admin'), ('administrator'), ('api'), ('contact'), ('dailynote'),
  ('explore'), ('feed'), ('help'), ('home'), ('legal'), ('login'), ('me'),
  ('moderator'), ('new'), ('notes'), ('official'), ('privacy'), ('root'),
  ('search'), ('settings'), ('signup'), ('staff'), ('support'), ('system'),
  ('team'), ('terms'), ('user'), ('www')
on conflict do nothing;

create or replace function reject_reserved_handle()
returns trigger
language plpgsql
as $$
begin
  if exists (select 1 from reserved_handles r where r.handle = new.handle) then
    raise exception 'handle % is reserved', new.handle using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_reject_reserved on profiles;
create trigger profiles_reject_reserved
  before insert or update of handle on profiles
  for each row execute function reject_reserved_handle();

drop trigger if exists profiles_set_updated_at on profiles;
create trigger profiles_set_updated_at
  before update on profiles
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- The graph
-- ---------------------------------------------------------------------------

create table if not exists follows (
  follower_id uuid not null references profiles(id) on delete cascade,
  followee_id uuid not null references profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (follower_id, followee_id),
  constraint no_self_follow check (follower_id <> followee_id)
);

-- "Who follows me", which the primary key's column order cannot answer.
create index if not exists follows_followee_idx on follows (followee_id);

-- One reaction kind, deliberately. Six emoji would force every reader to
-- decide what a laughing face means on a note about something painful.
create table if not exists reactions (
  note_id    uuid not null references notes(id) on delete cascade,
  user_id    uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (note_id, user_id)
);

create index if not exists reactions_note_idx on reactions (note_id);

-- ---------------------------------------------------------------------------
-- Safety
--
-- App Store guideline 1.2 requires a report mechanism, a block mechanism and
-- published contact details before a user-generated-content app may ship at
-- all. These are not a later phase; they land with the first public row.
-- ---------------------------------------------------------------------------

create table if not exists blocks (
  blocker_id uuid not null references profiles(id) on delete cascade,
  blocked_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint no_self_block check (blocker_id <> blocked_id)
);

create table if not exists reports (
  id          uuid primary key,
  -- Null once the reporter deletes their account; the report still stands.
  reporter_id uuid references profiles(id) on delete set null,
  note_id     uuid references notes(id) on delete cascade,
  reason      text not null,
  status      text not null default 'open',
  created_at  timestamptz not null default now(),
  constraint reports_status_check check (status in ('open', 'actioned', 'dismissed'))
);

-- The moderation queue: open reports, oldest first. Guideline 1.2 gives you 24
-- hours to act on one, so this index is read by a person, daily.
create index if not exists reports_status_idx on reports (status, created_at);

-- ---------------------------------------------------------------------------
-- Row level security
--
-- Rollout 1's own-rows policies are untouched. Everything below is additive.
-- ---------------------------------------------------------------------------

alter table profiles  enable row level security;
alter table follows   enable row level security;
alter table reactions enable row level security;
alter table blocks    enable row level security;
alter table reports   enable row level security;

-- The one read policy this rollout adds. Note what it does not mention:
-- followers, blocks, mutes. The database answers "is this row public"; it does
-- not answer "should this person see this now".
create policy public_notes_readable on notes
  for select using (visibility = 'public' and deleted = false);

-- Profiles are public by construction -- a handle you cannot look up is not an
-- identity. Only the owner may write one.
create policy profiles_readable on profiles for select using (true);
create policy own_profile on profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

-- Follower and following lists are visible; you may only create and delete
-- your own edges.
create policy follows_readable on follows for select using (true);
create policy own_follows on follows
  for all using (auth.uid() = follower_id) with check (auth.uid() = follower_id);

-- Counts are public, the identity of who liked what is not exposed by the app.
create policy reactions_readable on reactions for select using (true);
create policy own_reactions on reactions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- A block list is private to the person who made it. Being able to enumerate
-- who blocked you is itself a harassment vector.
create policy own_blocks on blocks
  for all using (auth.uid() = blocker_id) with check (auth.uid() = blocker_id);

-- Reports are write-only from the app's side: you may file one, and only
-- moderators (service role, which bypasses RLS) may read the queue.
create policy file_report on reports
  for insert with check (auth.uid() = reporter_id);
