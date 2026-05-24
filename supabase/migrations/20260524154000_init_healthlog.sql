create schema if not exists healthlog;

create extension if not exists pgcrypto;

create table if not exists healthlog.profile (
  id text primary key default 'current' check (id = 'current'),
  age integer check (age is null or age > 0),
  sex text check (sex is null or sex in ('female', 'male')),
  height_cm numeric check (height_cm is null or height_cm > 0),
  weight_kg numeric check (weight_kg is null or weight_kg > 0),
  activity_level text check (activity_level is null or activity_level in ('sedentary', 'light', 'moderate', 'active', 'very_active')),
  goal text,
  country text not null default 'Singapore',
  remarks text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists healthlog.body_measurements (
  id uuid primary key default gen_random_uuid(),
  measured_at timestamptz not null default now(),
  type text not null,
  value numeric not null,
  unit text not null,
  confidence numeric not null default 1 check (confidence >= 0 and confidence <= 1),
  remarks text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists healthlog.daily_entries (
  id uuid primary key default gen_random_uuid(),
  entry_date date not null,
  raw_note text not null,
  occurred_time time,
  parsed_items jsonb not null default '[]'::jsonb,
  action_type text not null default 'create' check (action_type in ('create', 'edit', 'delete', 'clarify')),
  confidence numeric not null default 1 check (confidence >= 0 and confidence <= 1),
  warnings jsonb not null default '[]'::jsonb,
  remarks text,
  is_active boolean not null default true,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists daily_entries_date_idx on healthlog.daily_entries (entry_date, is_active, occurred_time, created_at);

create table if not exists healthlog.daily_summaries (
  entry_date date primary key,
  calories numeric not null default 0,
  protein_g numeric not null default 0,
  fat_g numeric not null default 0,
  carbs_g numeric not null default 0,
  water_ml numeric not null default 0,
  exercise_calories numeric not null default 0,
  bmr numeric,
  base_tdee numeric,
  tdee numeric,
  estimated_deficit numeric,
  confidence numeric not null default 1 check (confidence >= 0 and confidence <= 1),
  breakdown jsonb not null default '{}'::jsonb,
  warnings jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists healthlog.llm_runs (
  id uuid primary key default gen_random_uuid(),
  prompt_version text not null,
  scenario text not null,
  model text not null,
  input_hash text not null,
  request_summary jsonb not null default '{}'::jsonb,
  output_json jsonb,
  latency_ms integer,
  success boolean not null,
  error text,
  created_at timestamptz not null default now()
);

create index if not exists llm_runs_created_idx on healthlog.llm_runs (created_at desc);

create table if not exists healthlog.analysis_reports (
  id uuid primary key default gen_random_uuid(),
  period_start date not null,
  period_end date not null,
  report_type text not null default 'weekly',
  payload jsonb not null default '{}'::jsonb,
  confidence numeric check (confidence is null or (confidence >= 0 and confidence <= 1)),
  created_at timestamptz not null default now()
);

create index if not exists analysis_reports_period_idx on healthlog.analysis_reports (period_start desc, period_end desc);
