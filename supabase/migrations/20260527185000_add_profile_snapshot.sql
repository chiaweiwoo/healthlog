alter table if exists healthlog.daily_summaries
  add column if not exists profile_snapshot jsonb;
