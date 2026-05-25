alter table if exists healthlog.daily_summaries
  add column if not exists alcohol_g numeric not null default 0;
