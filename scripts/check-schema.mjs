import { createClient } from "@supabase/supabase-js";
import { fileURLToPath } from "node:url";

const requiredEnv = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];

function createSupabase() {
  for (const key of requiredEnv) {
    if (!process.env[key]) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
  }

  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    db: { schema: "healthlog" },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function runCheck(label, task) {
  try {
    await task();
    return { label, ok: true, message: "ok" };
  } catch (error) {
    return {
      label,
      ok: false,
      message: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

async function assertSelectWorks(queryPromiseFactory) {
  const response = await queryPromiseFactory();
  if (response.error) throw new Error(response.error.message);
}

export async function runSchemaChecks(supabase) {
  const checks = await Promise.all([
    runCheck("healthlog.app_request_logs", () =>
      assertSelectWorks(() => supabase.from("app_request_logs").select("request_id", { head: true, count: "exact" }).limit(1)),
    ),
    runCheck("healthlog.daily_entries.parse_status", () =>
      assertSelectWorks(() => supabase.from("daily_entries").select("parse_status", { head: true, count: "exact" }).limit(1)),
    ),
    runCheck("healthlog.daily_entries.parse_error", () =>
      assertSelectWorks(() => supabase.from("daily_entries").select("parse_error", { head: true, count: "exact" }).limit(1)),
    ),
    runCheck("healthlog.daily_summaries.alcohol_g", () =>
      assertSelectWorks(() => supabase.from("daily_summaries").select("alcohol_g", { head: true, count: "exact" }).limit(1)),
    ),
    runCheck("healthlog.daily_summaries.profile_snapshot", () =>
      assertSelectWorks(() => supabase.from("daily_summaries").select("profile_snapshot", { head: true, count: "exact" }).limit(1)),
    ),
  ]);

  return {
    ok: checks.every((check) => check.ok),
    checks,
  };
}

export async function fetchSchemaDebugSnapshot(supabase) {
  const [recentFailedEntries, recentFailedLogs] = await Promise.all([
    supabase
      .from("daily_entries")
      .select("id,entry_date,parse_status,parse_error,is_active,created_at")
      .not("parse_error", "is", null)
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("app_request_logs")
      .select("request_id,route,action,status_code,created_at,error_payload")
      .eq("success", false)
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  return {
    recentFailedEntries: recentFailedEntries.error ? { error: recentFailedEntries.error.message } : recentFailedEntries.data ?? [],
    recentFailedLogs: recentFailedLogs.error ? { error: recentFailedLogs.error.message } : recentFailedLogs.data ?? [],
  };
}

async function main() {
  const supabase = createSupabase();
  const report = await runSchemaChecks(supabase);
  const debug = await fetchSchemaDebugSnapshot(supabase);

  console.log(JSON.stringify({ ...report, debug }, null, 2));

  if (!report.ok) {
    process.exit(1);
  }
}

const isDirectRun = process.argv[1] === fileURLToPath(import.meta.url);

if (isDirectRun) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
