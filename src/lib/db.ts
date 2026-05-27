import "server-only";

import { SummaryDisplayItem, summarizeDailyItems } from "@/lib/calculations";
import { normalizeDailyParseResultTimes, resolveFailedEntryOccurredTime } from "@/lib/daily-entry-time-guard";
import { buildProfileMetadata, buildProfileSnapshot, getProfileMemory, getProfileOverrides } from "@/lib/profile-memory";
import {
  ProfileNoteParseResult,
  DailyParseResult,
  ParsedDailyItem,
  ParseStatus,
  Profile,
  ProfileOverrideKey,
  Warning,
  profileSchema,
  ProfileMemoryItem,
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

export type ProfileNoteRow = {
  id: string;
  raw_note: string;
  parse_status: ParseStatus;
  parsed_payload: ProfileNoteParseResult | null;
  applied_profile: Partial<Profile> | null;
  applied_measurements: Array<Record<string, unknown>>;
  confidence: number;
  warnings: Warning[];
  remarks: string | null;
  parse_error: string | null;
  created_at: string;
  updated_at: string;
};

export class SummaryRecalculationWarning extends Error {
  entry: DailyEntryRow;
  summary: Record<string, unknown> | null;

  constructor(input: {
    message: string;
    entry: DailyEntryRow;
    summary: Record<string, unknown> | null;
    cause?: unknown;
  }) {
    super(input.message);
    this.name = "SummaryRecalculationWarning";
    this.entry = input.entry;
    this.summary = input.summary;
    this.cause = input.cause;
  }
}

export function isSummaryRecalculationWarning(error: unknown): error is SummaryRecalculationWarning {
  return error instanceof SummaryRecalculationWarning;
}

function buildParseFailureWarning(message: string): Warning {
  return {
    code: "parse_failed",
    message,
    improveWith: "Edit the note with more specifics, such as portion size, food name, or measurement details.",
  };
}

async function buildSummaryRecalculationWarning(entry: DailyEntryRow, error: unknown) {
  let summary: Record<string, unknown> | null = null;
  try {
    summary = await getDailySummary(entry.entry_date);
  } catch {
    summary = null;
  }

  return new SummaryRecalculationWarning({
    message: asErrorMessage(error),
    entry,
    summary,
    cause: error,
  });
}

function asErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") {
    return error.message;
  }
  return "Unexpected parsing error.";
}

function sanitizeProfilePatch(profile: Partial<Profile> | undefined) {
  if (!profile) return undefined;

  const patch: Partial<Profile> = {};
  if (typeof profile.age === "number" && Number.isFinite(profile.age) && profile.age > 0) patch.age = profile.age;
  if (profile.sex === "female" || profile.sex === "male") patch.sex = profile.sex;
  if (typeof profile.heightCm === "number" && Number.isFinite(profile.heightCm) && profile.heightCm > 0) patch.heightCm = profile.heightCm;
  if (typeof profile.weightKg === "number" && Number.isFinite(profile.weightKg) && profile.weightKg > 0) patch.weightKg = profile.weightKg;
  if (
    profile.activityLevel === "sedentary" ||
    profile.activityLevel === "light" ||
    profile.activityLevel === "moderate" ||
    profile.activityLevel === "active" ||
    profile.activityLevel === "very_active"
  ) {
    patch.activityLevel = profile.activityLevel;
  }
  if (typeof profile.goal === "string" && profile.goal.trim()) patch.goal = profile.goal;
  if (typeof profile.country === "string" && profile.country.trim()) patch.country = profile.country;
  if (typeof profile.city === "string") patch.city = profile.city;
  if (typeof profile.remarks === "string" && profile.remarks.trim()) patch.remarks = profile.remarks;

  return Object.keys(patch).length ? patch : undefined;
}

function hasProfileOverrideValues(overrides: ProfileNoteParseResult["overrides"]) {
  if (!overrides) return false;
  return ["waterTargetMl", "bmr", "neatCalories"].some((key) => typeof overrides[key as keyof typeof overrides] === "number");
}

function buildProfileNoteChangeSummary(
  previousProfile: Profile | null,
  nextProfile: Profile | null,
  addedMeasurements: BodyMeasurementRow[],
  parsed: ProfileNoteParseResult,
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

  const metadata = data.metadata && typeof data.metadata === "object" ? (data.metadata as Record<string, unknown>) : {};
  return profileSchema.parse({
    age: data.age,
    sex: data.sex,
    heightCm: data.height_cm,
    weightKg: data.weight_kg,
    activityLevel: data.activity_level,
    goal: data.goal,
    country: data.country ?? "Singapore",
    city: typeof metadata.city === "string" ? metadata.city : null,
    remarks: data.remarks,
    metadata: metadata,
  });
}

export async function upsertProfile(profile: Partial<Profile>) {
  const supabase = getSupabaseAdmin();
  const existing = await getProfile();
  const merged = {
    ...existing,
    ...profile,
    country: profile.country ?? existing?.country ?? "Singapore",
    city: profile.city !== undefined ? profile.city : existing?.city,
  };

  const metadata = {
    ...(merged.metadata ?? {}),
    city: merged.city ?? null,
  };

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
      metadata: metadata,
      updated_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function applyProfileManagerResult(parsed: ProfileNoteParseResult, noteId: string) {
  const existing = await getProfile();
  const profilePatch = sanitizeProfilePatch(parsed.profile);
  const hasOverrides = hasProfileOverrideValues(parsed.overrides);

  if (!existing && !profilePatch && !parsed.metadataUpserts.length && !hasOverrides) {
    return existing;
  }

  const metadata = buildProfileMetadata({
    existing: existing?.metadata ?? {},
    overrides: parsed.overrides,
    memoryUpserts: parsed.metadataUpserts.map((item: ProfileMemoryItem) => ({
      ...item,
      sourceNoteId: item.sourceNoteId ?? noteId,
      updatedAt: item.updatedAt ?? new Date().toISOString(),
    })),
  });

  const nextProfilePatch: Partial<Profile> = {
    ...(profilePatch ?? {}),
    metadata,
  };

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
  try {
    await recalculateDailySummary(data.entry_date);
  } catch (recalculationError) {
    throw await buildSummaryRecalculationWarning(data as DailyEntryRow, recalculationError);
  }
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
  try {
    await recalculateDailySummary(data.entry_date);
  } catch (recalculationError) {
    throw await buildSummaryRecalculationWarning(data as DailyEntryRow, recalculationError);
  }
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
  if (patch.isActive !== undefined && patch.rawNote === undefined) {
    try {
      await recalculateDailySummary(data.entry_date);
    } catch (recalculationError) {
      throw await buildSummaryRecalculationWarning(data as DailyEntryRow, recalculationError);
    }
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
  const profile = await getProfile();
  const profileForSummary = profile ?? { country: "Singapore", metadata: {} };
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
  const summary = summarizeDailyItems(items, profileForSummary);

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
      profile_snapshot: buildProfileSnapshot(profile),
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

export async function listProfileNotes() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from("profile_notes").select("*").order("created_at", { ascending: false }).limit(30);
  if (error) throw error;
  return (data ?? []) as ProfileNoteRow[];
}

export async function createPendingProfileNote(rawNote: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("profile_notes")
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
  return data as ProfileNoteRow;
}

export async function finalizeProfileNoteParsed(id: string, rawNote: string, parsed: ProfileNoteParseResult) {
  const previousProfile = await getProfile();
  const measurementsToInsert = parsed.measurements.filter((measurement) => measurement.type !== "height");
  const nextProfile = await applyProfileManagerResult(parsed, id);
  const insertedMeasurements = await addBodyMeasurements(measurementsToInsert);
  const changeSummary = buildProfileNoteChangeSummary(previousProfile, nextProfile, insertedMeasurements, parsed);

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("profile_notes")
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
    note: data as ProfileNoteRow,
    profile: nextProfile,
    measurements: await listBodyMeasurements(),
    changeSummary,
  };
}

export async function finalizeProfileNoteFailed(id: string, error: unknown) {
  const supabase = getSupabaseAdmin();
  const message = asErrorMessage(error);
  const { data, error: updateError } = await supabase
    .from("profile_notes")
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
    note: data as ProfileNoteRow,
    profile: await getProfile(),
    measurements: await listBodyMeasurements(),
    changeSummary: { action: "clarify", profileChanges: [], overrideChanges: [], memoryChanges: [], addedMeasurements: [] },
  };
}
