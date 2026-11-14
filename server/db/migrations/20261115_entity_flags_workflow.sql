-- Moderation workflow for entity flags.
-- Adds an open/resolved/dismissed lifecycle so flags can be reviewed and cleared
-- without conflating moderation with the flagged entity's own status.

alter table public.entity_flags
  add column if not exists status text not null default 'open',
  add column if not exists resolved_by uuid references public.users_table(id) on delete set null,
  add column if not exists resolved_at timestamptz,
  add column if not exists resolution_note text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'entity_flags_status_check'
  ) then
    alter table public.entity_flags
      add constraint entity_flags_status_check
      check (status in ('open', 'resolved', 'dismissed'));
  end if;
end $$;

create index if not exists entity_flags_open_entity_idx
  on public.entity_flags (entity_type, entity_id)
  where status = 'open';

comment on column public.entity_flags.status is 'Moderation state: open flags need review; resolved/dismissed flags are closed but kept for audit.';