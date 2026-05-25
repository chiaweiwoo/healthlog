import "server-only";

import { SummaryDisplayItem, summarizeDailyItems } from "@/lib/calculations";
import { normalizeDailyParseResultTimes, resolveFailedEntryOccurredTime } from "@/lib/daily-entry-time-guard";
import { buildProfileMetadata, getProfileMemory, getProfileOverrides } from "@/lib/profile-memory";
import {
  BodyParseResult,
  DailyParseResult,
  ParsedDailyItem,
  ParseStatus,
  Profile,
  ProfileOverrideKey,
  Warning,
  profileSchema,
} from "@/lib/schemas";
import { getSupabaseAdmin } from "@/lib/supabase";

export type DailyEntryRow = {
  id: string;
  entry_date: string;
  raw_note: string;
  occurred_time: string | null;
  action_type: string;
  parsed_items: ParsedDailyItem[];
  confidence: number;
  warnings: Warning[];
  remarks: string | null;
  parse_status: ParseStatus;
  parse_error: string | null;
  is_active: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

export type DailyEntryDateRow = {
  entry_date: string;
};

export type BodyMeasurementRow = {
  id: string;
  measured_at: string;
  type: string;
  value: number;
  unit: string;
  confidence: number;
  remarks: string | null;
  metadata: Record<string, unknown>;
};

export type BodyNoteRow = {
  id: string;
  raw_note: string;
  parse_status: ParseStatus;
  parsed_payload: BodyParseResult | null;
  applied_profile: Partial<Profile> | null;
  applied_measurements: Array<Record<string, unknown>>;
  confidence: number;
  warnings: Warning[];
  remarks: string | null;
  parse_error: string | null;
  created_at: string;
  updated_at: string;
};

function buildParseFailureWarning(message: string): Warning {
  return {
    code: "parse_failed",
    message,
    improveWith: "Edit the note with more specifics, such as portion size, food name, or measurement details.",
  };
}

function asErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") {
    return error.message;
  }
  return "Unexpected parsing error.";
}

function buildBodyNoteChangeSummary(
  previousProfile: Profile | null,
  nextProfile: Profile | null,
  addedMeasurements: BodyMeasurementRow[],
  parsed: BodyParseResult,
) {
  const fields: Array<keyof Profile> = ["age", "sex", "heightCm", "weightKg", "activityLevel", "goal", "country", "remarks"];
  const profileChanges = fields
    .filter((field) => previousProfile?.[field] !== nextProfile?.[field])
    .map((field) => ({
      field,
      before: previousProfile?.[field] ?? null,
      after: nextProfile?.[field] ?? null,
    }));

  const previousOverrides = getProfileOverrides(previousProfile);
  const nextOverrides = getProfileOverrides(nextProfile);
  const overrideKeys: ProfileOverrideKey[] = ["waterTargetMl", "bmr", "neatCalories"];
  const overrideChanges = overrideKeys
    .filter((key) => previousOverrides[key] !== nextOverrides[key])
    .map((key) => ({
      key,
      before: previousOverrides[key] ?? null,
      after: nextOverrides[key] ?? null,
    }));

  const previousMemory = getProfileMemory(previousProfile);
  const nextMemory = getProfileMemory(nextProfile);
  const previousMemoryMap = new Map(previousMemory.map((item) => [item.id, item]));
  const nextMemoryMap = new Map(nextMemory.map((item) => [item.id, item]));
  const touchedMemoryIds = new Set([
    ...parsed.metadataDeletes,
    ...parsed.metadataUpserts.map((item) => item.id),
  ]);
  const memoryChanges = Array.from(touchedMemoryIds)
    .map((id) => ({
      id,
      before: previousMemoryMap.get(id) ?? null,
      after: nextMemoryMap.get(id) ?? null,
    }))
    .filter((change) => change.before || change.after);

  return {
    action: parsed.action,
    profileChanges,
    overrideChanges,
    memoryChanges,
    addedMeasurements: addedMeasurements.map((measurement) => ({
      id: measurement.id,
      type: measurement.type,
      value: measurement.value,
      unit: measurement.unit,
      measuredAt: measurement.measured_at,
    })),
  };
}

export async function getProfile(): Promise<Profile | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from("profile").select("*").limit(1).maybeSingle();
  if (error) throw error;
  if (!data) return null;

  return profileSchema.parse({
    age: data.age,
    sex: data.sex,
    heightCm: data.height_cm,
    weightKg: data.weight_kg,
    activityLevel: data.activity_level,
    goal: data.goal,
    country: data.country ?? "Singapore",
    remarks: data.remarks,
    metadata: data.metadata ?? {},
  });
}

export async function upsertProfile(profile: Partial<Profile>) {
  const supabase = getSupabaseAdmin();
  const existing = await getProfile();
  const merged = { ...existing, ...profile, country: profile.country ?? existing?.country ?? "Singapore" };

  const { data, error } = await supabase
    .from("profile")
    .upsert({
      id: "current",
      age: merged.age ?? null,
      sex: merged.sex ?? null,
      height_cm: merged.heightCm ?? null,
      weight_kg: merged.weightKg ?? null,
      activity_level: merged.activityLevel ?? null,
      goal: merged.goal ?? null,
      country: merged.country ?? "Singapore",
      remarks: merged.remarks ?? null,
      metadata: merged.metadata ?? {},
      updated_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function applyProfileManagerResult(parsed: BodyParseResult, noteId: string) {
  const existing = await getProfile();
  const metadata = buildProfileMetadata({
    existing: existing?.metadata ?? {},
    overrides: parsed.overrides,
    overrideDeletes: parsed.overrideDeletes,
    memoryUpserts: parsed.metadataUpserts.map((item) => ({
      ...item,
      sourceNoteId: item.sourceNoteId ?? noteId,
      updatedAt: item.updatedAt ?? new Date().toISOString(),
    })),
    memoryDeletes: parsed.metadataDeletes,
  });

  const nextProfilePatch: Partial<Profile> = {
    ...(parsed.profile ?? {}),
    metadata,
  };

  if (!existing && !parsed.profile && !parsed.metadataUpserts.length && !parsed.metadataDeletes.length && !parsed.overrides && !parsed.overrideDeletes.length) {
    return existing;
  }

  await upsertProfile(nextProfilePatch);
  return getProfile();
}

export async function listDailyEntries(date: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("daily_entries")
    .select("*")
    .eq("entry_date", date)
    .order("occurred_time", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as DailyEntryRow[];
}

export async function listDailyEntryDates(from: string, to: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("daily_entries")
    .select("entry_date")
    .eq("is_active", true)
    .gte("entry_date", from)
    .lte("entry_date", to)
    .order("entry_date", { ascending: true });

  if (error) throw error;
  const uniqueDates = [...new Set(((data ?? []) as DailyEntryDateRow[]).map((row) => row.entry_date))];
  return uniqueDates;
}

export async function listActiveEntryDates() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("daily_entries")
    .select("entry_date")
    .eq("is_active", true)
    .order("entry_date", { ascending: true });

  if (error) throw error;
  return [...new Set(((data ?? []) as DailyEntryDateRow[]).map((row) => row.entry_date))];
}

export async function createPendingDailyEntry(date: string, rawNote: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("daily_entries")
    .insert({
      entry_date: date,
      raw_note: rawNote,
      action_type: "create",
      parsed_items: [],
      confidence: 0,
      warnings: [],
      remarks: null,
      parse_status: "pending",
      parse_error: null,
    })
    .select()
    .single();

  if (error) throw error;
  return data as DailyEntryRow;
}

export async function finalizeDailyEntryParsed(
  id: string,
  parsed: DailyParseResult,
  context: { entryDate: string; clientToday: string },
) {
  const supabase = getSupabaseAdmin();
  const normalized = normalizeDailyParseResultTimes(parsed, context);
  const { data, error } = await supabase
    .from("daily_entries")
    .update({
      occurred_time: normalized.occurredTime ?? null,
      action_type: normalized.actionType,
      parsed_items: normalized.items,
      confidence: normalized.confidence,
      warnings: normalized.warnings,
      remarks: normalized.remarks ?? null,
      parse_status: "parsed",
      parse_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  await recalculateDailySummary(data.entry_date);
  return data as DailyEntryRow;
}

export async function finalizeDailyEntryFailed(
  id: string,
  error: unknown,
  context: { entryDate: string; clientToday: string },
) {
  const supabase = getSupabaseAdmin();
  const message = asErrorMessage(error);
  const { data, error: updateError } = await supabase
    .from("daily_entries")
    .update({
      occurred_time: resolveFailedEntryOccurredTime(context),
      action_type: "clarify",
      parsed_items: [],
      confidence: 0,
      warnings: [buildParseFailureWarning("Saved note, but the structure is incomplete.")],
      remarks: null,
      parse_status: "failed",
      parse_error: message,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();

  if (updateError) throw updateError;
  await recalculateDailySummary(data.entry_date);
  return data as DailyEntryRow;
}

export async function patchDailyEntry(id: string, patch: { rawNote?: string; isActive?: boolean }) {
  const supabase = getSupabaseAdmin();
  const next: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (patch.rawNote !== undefined) {
    next.raw_note = patch.rawNote;
    next.occurred_time = null;
    next.action_type = "create";
    next.parsed_items = [];
    next.confidence = 0;
    next.warnings = [];
    next.remarks = null;
    next.parse_status = "pending";
    next.parse_error = null;
  }
  if (patch.isActive !== undefined) {
    next.is_active = patch.isActive;
    next.deleted_at = patch.isActive ? null : new Date().toISOString();
  }

  const { data, error } = await supabase.from("daily_entries").update(next).eq("id", id).select().single();
  if (error) throw error;
  if (patch.rawNote !== undefined || patch.isActive !== undefined) {
    await recalculateDailySummary(data.entry_date);
  }
  return data as DailyEntryRow;
}

export async function getDailyEntry(id: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from("daily_entries").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return (data ?? null) as DailyEntryRow | null;
}

export async function getDailySummary(date: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from("daily_summaries").select("*").eq("entry_date", date).maybeSingle();
  if (error) throw error;
  return data;
}

export async function recalculateDailySummary(date: string) {
  const supabase = getSupabaseAdmin();
  const entries = (await listDailyEntries(date)).filter((entry) => entry.is_active);
  const profile = (await getProfile()) ?? { country: "Singapore", metadata: {} };
  const parsedEntries = entries.filter((entry) => entry.parse_status === "parsed");
  const failedEntries = entries.filter((entry) => entry.parse_status === "failed" || entry.parse_status === "pending");
  const items = parsedEntries.flatMap((entry) =>
    (entry.parsed_items ?? []).map((item) => ({
      ...item,
      sourceCreatedAt: entry.created_at,
      sourceEntryId: entry.id,
      sourceOccurredTime: item.occurredTime ?? entry.occurred_time,
      sourceRawNote: entry.raw_note,
    } satisfies SummaryDisplayItem)),
  );
  const summary = summarizeDailyItems(items, profile);

  const warnings = [...summary.warnings];
  if (failedEntries.length) {
    warnings.push({
      code: "entries_unparsed",
      message: `${failedEntries.length} note${failedEntries.length === 1 ? " is" : "s are"} still unparsed, so totals may be incomplete.`,
      improveWith: "Open the entry and add more detail or retry the note.",
    });
  }

  const breakdown = {
    ...summary.breakdown,
    meta: {
      ...(summary.breakdown.meta ?? {}),
      unparsedEntryCount: failedEntries.length,
    },
  };

  const estimatedDeficit = summary.estimatedDeficit !== null && failedEntries.length === 0 ? summary.estimatedDeficit : null;

  const { data, error } = await supabase
    .from("daily_summaries")
    .upsert({
      entry_date: date,
      calories: summary.calories,
      protein_g: summary.proteinG,
      fat_g: summary.fatG,
      carbs_g: summary.carbsG,
      alcohol_g: summary.alcoholG,
      water_ml: summary.waterMl,
      exercise_calories: summary.exerciseCalories,
      bmr: summary.bmr,
      base_tdee: summary.baseTdee,
      tdee: summary.tdee,
      estimated_deficit: estimatedDeficit,
      confidence: summary.confidence,
      warnings,
      breakdown,
      updated_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function recalculateAllDailySummaries() {
  const dates = await listActiveEntryDates();
  const summaries = [];
  for (const date of dates) {
    summaries.push(await recalculateDailySummary(date));
  }
  return summaries;
}

export async function addBodyMeasurements(measurements: Array<Record<string, unknown>>) {
  if (!measurements.length) return [];
  const supabase = getSupabaseAdmin();
  const rows = measurements.map((measurement) => ({
    measured_at: measurement.measuredAt ?? new Date().toISOString(),
    type: measurement.type,
    value: measurement.value,
    unit: measurement.unit,
    confidence: measurement.confidence,
    remarks: measurement.remarks ?? null,
    metadata: measurement.metadata ?? {},
  }));

  const { data, error } = await supabase.from("body_measurements").insert(rows).select();
  if (error) throw error;
  return (data ?? []) as BodyMeasurementRow[];
}

export async function listBodyMeasurements() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from("body_measurements").select("*").order("measured_at", { ascending: false }).limit(100);
  if (error) throw error;
  return (data ?? []) as BodyMeasurementRow[];
}

export async function listBodyNotes() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from("body_notes").select("*").order("created_at", { ascending: false }).limit(30);
  if (error) throw error;
  return (data ?? []) as BodyNoteRow[];
}

export async function createPendingBodyNote(rawNote: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("body_notes")
    .insert({
      raw_note: rawNote,
      parse_status: "pending",
      parsed_payload: null,
      applied_profile: null,
      applied_measurements: [],
      confidence: 0,
      warnings: [],
      remarks: null,
      parse_error: null,
    })
    .select()
    .single();

  if (error) throw error;
  return data as BodyNoteRow;
}

export async function finalizeBodyNoteParsed(id: string, rawNote: string, parsed: BodyParseResult) {
  const previousProfile = await getProfile();
  const measurementsToInsert = parsed.measurements.filter((measurement) => measurement.type !== "height");
  const nextProfile = await applyProfileManagerResult(parsed, id);
  const insertedMeasurements = await addBodyMeasurements(measurementsToInsert);
  const changeSummary = buildBodyNoteChangeSummary(previousProfile, nextProfile, insertedMeasurements, parsed);

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("body_notes")
    .update({
      parse_status: "parsed",
      parsed_payload: parsed,
      applied_profile: {
        ...(parsed.profile ?? {}),
        metadataUpserts: parsed.metadataUpserts,
        metadataDeletes: parsed.metadataDeletes,
        overrides: parsed.overrides ?? {},
        overrideDeletes: parsed.overrideDeletes,
        action: parsed.action,
      },
      applied_measurements: measurementsToInsert,
      confidence: parsed.confidence,
      warnings: parsed.warnings,
      remarks: parsed.remarks ?? null,
      parse_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;

  return {
    note: data as BodyNoteRow,
    profile: nextProfile,
    measurements: await listBodyMeasurements(),
    changeSummary,
  };
}

export async function finalizeBodyNoteFailed(id: string, error: unknown) {
  const supabase = getSupabaseAdmin();
  const message = asErrorMessage(error);
  const { data, error: updateError } = await supabase
    .from("body_notes")
    .update({
      parse_status: "failed",
      parsed_payload: null,
      applied_profile: null,
      applied_measurements: [],
      confidence: 0,
      warnings: [buildParseFailureWarning("Saved body note, but the profile update needs clarification.")],
      remarks: null,
      parse_error: message,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();
  if (updateError) throw updateError;
  return {
    note: data as BodyNoteRow,
    profile: await getProfile(),
    measurements: await listBodyMeasurements(),
    changeSummary: { action: "clarify", profileChanges: [], overrideChanges: [], memoryChanges: [], addedMeasurements: [] },
  };
}
