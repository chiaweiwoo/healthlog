import "server-only";

import { summarizeDailyItems } from "@/lib/calculations";
import { DailyParseResult, ParsedDailyItem, Profile, Warning, profileSchema } from "@/lib/schemas";
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
  is_active: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

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

export async function listDailyEntries(date: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("daily_entries")
    .select("*")
    .eq("entry_date", date)
    .order("occurred_time", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data ?? []) as DailyEntryRow[];
}

export async function createDailyEntry(date: string, rawNote: string, parsed: DailyParseResult) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("daily_entries")
    .insert({
      entry_date: date,
      raw_note: rawNote,
      occurred_time: parsed.occurredTime ?? null,
      action_type: parsed.actionType,
      parsed_items: parsed.items,
      confidence: parsed.confidence,
      warnings: parsed.warnings,
      remarks: parsed.remarks ?? null,
    })
    .select()
    .single();

  if (error) throw error;
  await recalculateDailySummary(date);
  return data;
}

export async function patchDailyEntry(id: string, patch: { rawNote?: string; isActive?: boolean; parsed?: DailyParseResult }) {
  const supabase = getSupabaseAdmin();
  const next: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (patch.rawNote !== undefined) next.raw_note = patch.rawNote;
  if (patch.isActive !== undefined) {
    next.is_active = patch.isActive;
    next.deleted_at = patch.isActive ? null : new Date().toISOString();
  }
  if (patch.parsed) {
    next.occurred_time = patch.parsed.occurredTime ?? null;
    next.action_type = patch.parsed.actionType;
    next.parsed_items = patch.parsed.items;
    next.confidence = patch.parsed.confidence;
    next.warnings = patch.parsed.warnings;
    next.remarks = patch.parsed.remarks ?? null;
  }

  const { data, error } = await supabase.from("daily_entries").update(next).eq("id", id).select().single();
  if (error) throw error;
  await recalculateDailySummary(data.entry_date);
  return data;
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
  const items = entries.flatMap((entry) => entry.parsed_items ?? []);
  const summary = summarizeDailyItems(items, profile);

  const { data, error } = await supabase
    .from("daily_summaries")
    .upsert({
      entry_date: date,
      calories: summary.calories,
      protein_g: summary.proteinG,
      fat_g: summary.fatG,
      carbs_g: summary.carbsG,
      water_ml: summary.waterMl,
      exercise_calories: summary.exerciseCalories,
      bmr: summary.bmr,
      base_tdee: summary.baseTdee,
      tdee: summary.tdee,
      estimated_deficit: summary.estimatedDeficit,
      confidence: summary.confidence,
      warnings: summary.warnings,
      breakdown: summary.breakdown,
      updated_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) throw error;
  return data;
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
  return data;
}

export async function listBodyMeasurements() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from("body_measurements").select("*").order("measured_at", { ascending: false }).limit(100);
  if (error) throw error;
  return data ?? [];
}
