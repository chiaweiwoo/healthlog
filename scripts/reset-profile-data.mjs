import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const requiredEnv = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];

for (const key of requiredEnv) {
  if (!process.env[key]) {
    console.error(`Missing required environment variable: ${key}`);
    process.exit(1);
  }
}

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const backupDir = path.join(rootDir, ".local");
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupPath = path.join(backupDir, `profile-backup-${timestamp}.json`);

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  db: { schema: "healthlog" },
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  const [{ data: profile, error: profileError }, { count: bodyNotesCount, error: bodyNotesError }, { count: bodyMeasurementsCount, error: bodyMeasurementsError }, { count: analysisReportsCount, error: analysisReportsError }] =
    await Promise.all([
      supabase.from("profile").select("*").eq("id", "current").maybeSingle(),
      supabase.from("body_notes").select("*", { count: "exact", head: true }),
      supabase.from("body_measurements").select("*", { count: "exact", head: true }),
      supabase.from("analysis_reports").select("*", { count: "exact", head: true }),
    ]);

  for (const error of [profileError, bodyNotesError, bodyMeasurementsError, analysisReportsError]) {
    if (error) throw error;
  }

  await fs.mkdir(backupDir, { recursive: true });
  await fs.writeFile(
    backupPath,
    JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        profile,
        counts: {
          bodyNotes: bodyNotesCount ?? 0,
          bodyMeasurements: bodyMeasurementsCount ?? 0,
          analysisReports: analysisReportsCount ?? 0,
        },
      },
      null,
      2,
    ),
    "utf8",
  );

  const deletes = await Promise.all([
    supabase.from("profile").delete().eq("id", "current"),
    supabase.from("body_notes").delete().not("id", "is", null),
    supabase.from("body_measurements").delete().not("id", "is", null),
    supabase.from("analysis_reports").delete().not("id", "is", null),
  ]);

  for (const result of deletes) {
    if (result.error) throw result.error;
  }

  console.log(`Profile backup written to ${backupPath}`);
  console.log("Cleared healthlog.profile(current), body_notes, body_measurements, and analysis_reports.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
