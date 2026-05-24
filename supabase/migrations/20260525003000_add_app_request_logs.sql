create table if not exists healthlog.app_request_logs (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null,
  route text not null,
  method text not null,
  action text not null,
  username text,
  status_code integer not null,
  success boolean not null,
  duration_ms integer not null,
  request_payload jsonb not null default '{}'::jsonb,
  response_payload jsonb,
  error_payload jsonb,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists app_request_logs_created_idx on healthlog.app_request_logs (created_at desc);
create index if not exists app_request_logs_request_id_idx on healthlog.app_request_logs (request_id);
create index if not exists app_request_logs_action_idx on healthlog.app_request_logs (action, created_at desc);
