alter table if exists healthlog.daily_entries
  add column if not exists parse_status text not null default 'parsed';

alter table if exists healthlog.daily_entries
  add column if not exists parse_error text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'daily_entries_parse_status_check'
  ) then
    alter table healthlog.daily_entries
      add constraint daily_entries_parse_status_check
      check (parse_status in ('pending', 'parsed', 'failed'));
  end if;
end $$;

update healthlog.daily_entries
set parse_status = 'parsed'
where parse_status is null;

create index if not exists daily_entries_parse_status_idx
  on healthlog.daily_entries (entry_date, is_active, parse_status, created_at desc);

create table if not exists healthlog.body_notes (
  id uuid primary key default gen_random_uuid(),
  raw_note text not null,
  parse_status text not null default 'pending'
    check (parse_status in ('pending', 'parsed', 'failed')),
  parsed_payload jsonb,
  applied_profile jsonb,
  applied_measurements jsonb not null default '[]'::jsonb,
  confidence numeric not null default 0 check (confidence >= 0 and confidence <= 1),
  warnings jsonb not null default '[]'::jsonb,
  remarks text,
  parse_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists body_notes_created_idx
  on healthlog.body_notes (created_at desc);

grant usage on schema healthlog to service_role;
grant all privileges on all tables in schema healthlog to service_role;
grant all privileges on all sequences in schema healthlog to service_role;
grant all privileges on all routines in schema healthlog to service_role;

alter default privileges in schema healthlog
grant all on tables to service_role;

alter default privileges in schema healthlog
grant all on sequences to service_role;

alter default privileges in schema healthlog
grant all on routines to service_role;
