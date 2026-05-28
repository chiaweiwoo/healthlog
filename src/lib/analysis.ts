import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase";
import { Profile, AnalysisStats, AnalysisEvidence, ParsedDailyItem } from "@/lib/schemas";
import { deriveFoodNutrition } from "@/lib/calculations";

// Configurable sliding window size for the analysis reports
export const ANALYSIS_PERIOD_DAYS = 14;

// Helper to get past calendar days range before a given date
export function getPastDaysRange(todayStr: string, periodDays: number = ANALYSIS_PERIOD_DAYS): string[] {
  const dates: string[] = [];
  const [year, month, day] = todayStr.split("-").map(Number);
  // Using Date.UTC to prevent any timezone shifts during calculation
  const todayDate = new Date(Date.UTC(year, month - 1, day));
  for (let i = periodDays; i >= 1; i--) {
    const d = new Date(todayDate.getTime() - i * 24 * 60 * 60 * 1000);
    dates.push(d.toISOString().split("T")[0]);
  }
  return dates;
}

export async function getRealTimeAnalysisStats(
  profile: Profile,
  todayStr: string
): Promise<{ stats: AnalysisStats; evidence: AnalysisEvidence }> {
  const supabase = getSupabaseAdmin();
  const past7Days = getPastDaysRange(todayStr, ANALYSIS_PERIOD_DAYS);
  const startDate = past7Days[0];
  const endDate = past7Days[past7Days.length - 1];

  // 1. Fetch active parsed daily entries in target range
  const { data: dbEntries, error: entriesErr } = await supabase
    .from("daily_entries")
    .select("*")
    .eq("is_active", true)
    .eq("parse_status", "parsed")
    .gte("entry_date", startDate)
    .lte("entry_date", endDate);

  if (entriesErr) throw entriesErr;
  const entries = dbEntries || [];

  // Group parsed entries by date
  const parsedEntriesByDate: Record<string, typeof entries> = {};
  for (const entry of entries) {
    if (!parsedEntriesByDate[entry.entry_date]) {
      parsedEntriesByDate[entry.entry_date] = [];
    }
    parsedEntriesByDate[entry.entry_date].push(entry);
  }

  const completeDays = Object.keys(parsedEntriesByDate).sort();
  const completeDaysCount = completeDays.length;

interface SummaryDbRow {
  entry_date: string;
  calories: number;
  protein_g: number;
  fat_g: number;
  carbs_g: number;
  alcohol_g: number;
  water_ml: number;
  exercise_calories: number;
  tdee: number | null;
}

  // 2. Fetch daily summaries for complete days
  let summaries: SummaryDbRow[] = [];
  if (completeDaysCount > 0) {
    const { data: dbSummaries, error: summariesErr } = await supabase
      .from("daily_summaries")
      .select("*")
      .in("entry_date", completeDays);

    if (summariesErr) throw summariesErr;
    summaries = (dbSummaries || []) as unknown as SummaryDbRow[];
  }

  const summariesByDate = Object.fromEntries(summaries.map((s) => [s.entry_date, s]));

  // 3. Compute Deterministic Stats
  let totalIntakeCalories = 0;
  let totalProteinG = 0;
  let totalFatG = 0;
  let totalCarbsG = 0;
  let totalAlcoholG = 0;
  let totalWaterMl = 0;
  let totalExerciseCalories = 0;
  let totalQuotaCalories = 0;
  let quotaDays = 0;

  const divisor = completeDaysCount > 0 ? completeDaysCount : 1;

  for (const date of completeDays) {
    const summary = summariesByDate[date];
    if (summary) {
      totalIntakeCalories += Number(summary.calories) || 0;
      totalProteinG += Number(summary.protein_g) || 0;
      totalFatG += Number(summary.fat_g) || 0;
      totalCarbsG += Number(summary.carbs_g) || 0;
      totalAlcoholG += Number(summary.alcohol_g) || 0;
      totalWaterMl += Number(summary.water_ml) || 0;
      totalExerciseCalories += Number(summary.exercise_calories) || 0;

      if (summary.tdee) {
        totalQuotaCalories += Number(summary.tdee);
        quotaDays++;
      }
    }
  }

  const averageIntakeCalories = Math.round(totalIntakeCalories / divisor);
  const averageQuotaCalories = quotaDays > 0 ? Math.round(totalQuotaCalories / quotaDays) : null;
  const averageNetCalories = averageQuotaCalories !== null ? Math.round(averageIntakeCalories - averageQuotaCalories) : null;

  const averageProteinG = Math.round((totalProteinG / divisor) * 10) / 10;
  const averageFatG = Math.round((totalFatG / divisor) * 10) / 10;
  const averageCarbsG = Math.round((totalCarbsG / divisor) * 10) / 10;
  const averageAlcoholG = Math.round((totalAlcoholG / divisor) * 10) / 10;
  const averageWaterMl = Math.round(totalWaterMl / divisor);
  const averageExerciseCalories = Math.round(totalExerciseCalories / divisor);
  const consistencyScore = Math.round((completeDaysCount / ANALYSIS_PERIOD_DAYS) * 100) / 100;

  const stats: AnalysisStats = {
    periodStart: startDate,
    periodEnd: endDate,
    completeDays: completeDaysCount,
    totalIntakeCalories,
    averageIntakeCalories,
    averageQuotaCalories,
    averageNetCalories,
    totalProteinG: Math.round(totalProteinG * 10) / 10,
    averageProteinG,
    totalFatG: Math.round(totalFatG * 10) / 10,
    averageFatG,
    totalCarbsG: Math.round(totalCarbsG * 10) / 10,
    averageCarbsG,
    totalAlcoholG: Math.round(totalAlcoholG * 10) / 10,
    averageAlcoholG,
    averageWaterMl,
    averageExerciseCalories,
    consistencyScore,
  };

  // 4. Extract Contributor Evidence
  const allItems: Array<ParsedDailyItem & { date: string; sourceRawNote: string }> = [];
  for (const date of completeDays) {
    const dayEntries = parsedEntriesByDate[date] || [];
    for (const entry of dayEntries) {
      const items = (entry.parsed_items as ParsedDailyItem[]) || [];
      for (const item of items) {
        const derived = item.kind === "food" ? deriveFoodNutrition(item) : null;
        const nutrition = derived
          ? {
              calories: derived.calories,
              proteinG: derived.proteinG,
              fatG: derived.fatG,
              carbsG: derived.carbsG,
              alcoholG: derived.alcoholG,
            }
          : item.nutrition;

        allItems.push({
          ...item,
          nutrition,
          date,
          sourceRawNote: entry.raw_note,
        });
      }
    }
  }

  const topCalorieFoods = allItems
    .filter((item) => item.kind === "food" && item.nutrition?.calories)
    .sort((a, b) => (b.nutrition?.calories || 0) - (a.nutrition?.calories || 0))
    .slice(0, 5)
    .map((item) => ({
      kind: item.kind,
      label: item.label,
      quantity: item.quantity || null,
      confidence: item.confidence,
      nutrition: item.nutrition,
      warnings: item.warnings || [],
      metadata: item.metadata || {},
      remarks: `Logged on ${item.date}: "${item.sourceRawNote}"`,
    }));

  const alcoholContributors = allItems
    .filter((item) => item.kind === "food" && item.nutrition?.alcoholG && item.nutrition.alcoholG > 0)
    .map((item) => ({
      kind: item.kind,
      label: item.label,
      quantity: item.quantity || null,
      confidence: item.confidence,
      nutrition: item.nutrition,
      warnings: item.warnings || [],
      metadata: item.metadata || {},
      remarks: `Logged on ${item.date}: "${item.sourceRawNote}"`,
    }));

  const waterContributors = allItems
    .filter((item) => item.kind === "water" || (item.waterMl && item.waterMl > 0))
    .map((item) => ({
      kind: item.kind,
      label: item.label,
      quantity: item.quantity || null,
      confidence: item.confidence,
      waterMl: item.waterMl || null,
      warnings: item.warnings || [],
      metadata: item.metadata || {},
      remarks: `Logged on ${item.date}: "${item.sourceRawNote}"`,
    }));

  const exerciseContributors = allItems
    .filter((item) => item.kind === "exercise" || (item.exerciseCalories && item.exerciseCalories > 0))
    .map((item) => ({
      kind: item.kind,
      label: item.label,
      quantity: item.quantity || null,
      confidence: item.confidence,
      exerciseCalories: item.exerciseCalories || null,
      warnings: item.warnings || [],
      metadata: item.metadata || {},
      remarks: `Logged on ${item.date}: "${item.sourceRawNote}"`,
    }));

  const highCalorieLowProteinCandidates = allItems
    .filter((item) => {
      if (item.kind !== "food") return false;
      const cals = item.nutrition?.calories || 0;
      const prot = item.nutrition?.proteinG || 0;
      return cals >= 300 && prot < 10;
    })
    .map((item) => ({
      kind: item.kind,
      label: item.label,
      quantity: item.quantity || null,
      confidence: item.confidence,
      nutrition: item.nutrition,
      warnings: item.warnings || [],
      metadata: item.metadata || {},
      remarks: `Logged on ${item.date}: "${item.sourceRawNote}"`,
    }));

  const evidence: AnalysisEvidence = {
    topCalorieFoods,
    alcoholContributors,
    waterContributors,
    exerciseContributors,
    highCalorieLowProteinCandidates,
  };

  return { stats, evidence };
}
