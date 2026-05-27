-- Mirror of DDL applied directly to the live project.
-- Adds admin_alert top-level column to llm_runs so prompt-insights can query it efficiently.

ALTER TABLE healthlog.llm_runs ADD COLUMN IF NOT EXISTS admin_alert jsonb DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_llm_runs_admin_alert
  ON healthlog.llm_runs USING gin (admin_alert jsonb_path_ops)
  WHERE admin_alert IS NOT NULL;
