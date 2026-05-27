import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const requiredEnv = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
const confirmationFlag = "--confirm-reset-profile-data";
const isDirectRun = process.argv[1] === fileURLToPath(import.meta.url);

export function hasConfirmationFlag(argv = process.argv.slice(2)) {
  return argv.includes(confirmationFlag);
}

export function buildProfileResetBackup(input) {
  return {
    exportedAt: new Date().toISOString(),
    profile: input.profile ?? null,
    bodyNotes: input.bodyNotes ?? [],
    bodyMeasurements: input.bodyMeasurements ?? [],
    analysisReports: input.analysisReports ?? [],
    counts: {
      bodyNotes: input.bodyNotes?.length ?? 0,
      bodyMeasurements: input.bodyMeasurements?.length ?? 0,
      analysisReports: input.analysisReports?.length ?? 0,
    },
  };
}

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const backupDir = path.join(rootDir, ".local");
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupPath = path.join(backupDir, `profile-backup-${timestamp}.json`);

async function main() {
  for (const key of requiredEnv) {
    if (!process.env[key]) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
  }

  if (!hasConfirmationFlag()) {
    throw new Error(`Refusing to reset profile data without ${confirmationFlag}`);
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    db: { schema: "healthlog" },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const [
    { data: profile, error: profileError },
    { data: bodyNotes, error: bodyNotesError },
    { data: bodyMeasurements, error: bodyMeasurementsError },
    { data: analysisReports, error: analysisReportsError },
  ] = await Promise.all([
    supabase.from("profile").select("*").eq("id", "current").maybeSingle(),
    supabase.from("body_notes").select("*").order("created_at", { ascending: false }),
    supabase.from("body_measurements").select("*").order("measured_at", { ascending: false }),
    supabase.from("analysis_reports").select("*").order("created_at", { ascending: false }),
  ]);

  for (const error of [profileError, bodyNotesError, bodyMeasurementsError, analysisReportsError]) {
    if (error) throw error;
  }

  await fs.mkdir(backupDir, { recursive: true });
  await fs.writeFile(
    backupPath,
    JSON.stringify(
      buildProfileResetBackup({
        profile,
        bodyNotes,
        bodyMeasurements,
        analysisReports,
      }),
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

if (isDirectRun) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
