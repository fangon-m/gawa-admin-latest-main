-- 20261112_entity_notes_generic.sql
--
-- Creates the table for notes attached to any entity, and gives it the shape
-- the admin client expects.
--
-- WHY THIS FILE EXISTS
--   The Job Detail page keeps its notes through
--   GET/POST /api/entity-notes/:entityType/:entityId and passes the table
--   name as the type ('job_posts'). The table was never created — the
--   controller only had a placeholder list of "inline" entity types, so
--   every one of those calls was answered with 400 and the panel always
--   showed "No notes yet".
--
--   Notes on a *user* live in `user_notes` and are unaffected.
--
-- HOW TO APPLY
--   Paste into the Supabase SQL Editor and run it once. It is idempotent.
--
-- VERIFY
--   select entity_type, entity_id, content, created_at
--     from public.entity_notes order by created_at desc;

-- 1. The table, with the generic columns.
create table if not exists public.entity_notes (
  id          uuid primary key default gen_random_uuid(),
  entity_type text,
  entity_id   uuid,
  user_id     uuid references public.users_table(id) on delete cascade,
  content     text not null,
  author_id   uuid references public.users_table(id) on delete set null,
  created_at  timestamptz not null default now()
);

-- 2. Bring an older, user-only shape up to date.
alter table public.entity_notes add column if not exists entity_type text;
alter table public.entity_notes add column if not exists entity_id uuid;

update public.entity_notes
   set entity_type = 'user',
       entity_id = user_id
 where entity_id is null
   and user_id is not null;

alter table public.entity_notes alter column user_id drop not null;
alter table public.entity_notes alter column content drop not null;

-- 3. Index for the lookup the endpoint performs.
create index if not exists entity_notes_entity_idx
  on public.entity_notes (entity_type, entity_id);

comment on table public.entity_notes is
  'Administrator notes attached to any entity (entity_type + entity_id).';

-- 4. Same treatment as the other admin-only tables: only the admin server
--    reaches it.
alter table public.entity_notes enable row level security;
