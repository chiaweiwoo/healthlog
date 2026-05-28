import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";
import { Langfuse } from "langfuse";
import { createHash } from "node:crypto";
import { z } from "zod";

const PROMPT_VERSION = "2026-05-28-analysis-v8";
const MODEL_NAME = "gemini-3.5-flash";

const ANALYSIS_PERIOD_DAYS = Number(process.env.ANALYSIS_PERIOD_DAYS) || 14;

// 1. Validate Environment Variables
const requiredEnv = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "GEMINI_API_KEY",
];

for (const key of requiredEnv) {
  if (!process.env[key]) {
    console.error(`Missing required environment variable: ${key}`);
    process.exit(1);
  }
}

// Initialize Clients
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
  db: {
    schema: "healthlog",
  },
});

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

let langfuse = null;
if (process.env.LANGFUSE_PUBLIC_KEY && process.env.LANGFUSE_SECRET_KEY) {
  langfuse = new Langfuse({
    publicKey: process.env.LANGFUSE_PUBLIC_KEY,
    secretKey: process.env.LANGFUSE_SECRET_KEY,
    baseUrl: process.env.LANGFUSE_BASE_URL,
  });
}

// 2. Extensible Timezone / Date Helpers
function getUserTimezone() {
  return "Asia/Singapore"; // Extensible to process.env.USER_TIMEZONE or profile.timezone
}

function getTodayString(tz = getUserTimezone()) {
  const options = { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" };
  const formatter = new Intl.DateTimeFormat("en-CA", options); // outputs YYYY-MM-DD
  return formatter.format(new Date());
}

function getPastDaysRange(todayStr, periodDays = ANALYSIS_PERIOD_DAYS) {
  const dates = [];
  const [year, month, day] = todayStr.split("-").map(Number);
  // Midnight SGT/UTC to avoid date wrapping errors
  const todayDate = new Date(Date.UTC(year, month - 1, day));
  for (let i = periodDays; i >= 1; i--) {
    const d = new Date(todayDate.getTime() - i * 24 * 60 * 60 * 1000);
    dates.push(d.toISOString().split("T")[0]);
  }
  return dates;
}

function mapConfidenceTextToNumeric(text) {
  switch (text?.toLowerCase()) {
    case "high":
      return 1.0;
    case "medium":
      return 0.7;
    case "low":
    default:
      return 0.3;
  }
}

// Atwater Constants & Food Nutrition Derivation logic matching Calculations.ts
const atwaterFactors = {
  protein: 4,
  carbs: 4,
  fat: 9,
  alcohol: 7,
};

function buildAnalysisEnergySplit({
  averageProteinG,
  averageCarbsG,
  averageFatG,
  averageAlcoholG,
}) {
  const entries = [
    { label: "protein", calories: Math.round(averageProteinG * atwaterFactors.protein) },
    { label: "carbs", calories: Math.round(averageCarbsG * atwaterFactors.carbs) },
    { label: "fat", calories: Math.round(averageFatG * atwaterFactors.fat) },
    { label: "alcohol", calories: Math.round(averageAlcoholG * atwaterFactors.alcohol) },
  ];

  const totalCalories = entries.reduce((sum, entry) => sum + entry.calories, 0);
  const withPercentages = entries.map((entry) => ({
    ...entry,
    percentage: totalCalories > 0 ? Math.round((entry.calories / totalCalories) * 100) : 0,
  }));

  const percentageGap =
    totalCalories > 0 ? 100 - withPercentages.reduce((sum, entry) => sum + entry.percentage, 0) : 0;
  if (percentageGap !== 0 && withPercentages.length > 0) {
    const largestEntry = [...withPercentages].sort((a, b) => b.calories - a.calories)[0];
    const target = withPercentages.find((entry) => entry.label === largestEntry.label);
    if (target) {
      target.percentage += percentageGap;
    }
  }

  return {
    totalCalories,
    entries: withPercentages,
  };
}

function isKnownNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function deriveFoodNutrition(item) {
  const nutrition = item.nutrition;
  const proteinG = isKnownNumber(nutrition?.proteinG) ? nutrition.proteinG : null;
  const fatG = isKnownNumber(nutrition?.fatG) ? nutrition.fatG : null;
  const carbsG = isKnownNumber(nutrition?.carbsG) ? nutrition.carbsG : null;
  const alcoholG = isKnownNumber(nutrition?.alcoholG) ? nutrition.alcoholG : null;
  const modelCalories = isKnownNumber(nutrition?.calories) ? nutrition.calories : null;

  const hasAnyBreakdown = [proteinG, fatG, carbsG, alcoholG].some(isKnownNumber);
  if (hasAnyBreakdown) {
    const calories =
      (proteinG ?? 0) * atwaterFactors.protein +
      (fatG ?? 0) * atwaterFactors.fat +
      (carbsG ?? 0) * atwaterFactors.carbs +
      (alcoholG ?? 0) * atwaterFactors.alcohol;

    return {
      calories: Math.round(calories),
      caloriesIncomplete: ![proteinG, fatG, carbsG].every(isKnownNumber),
      proteinG,
      fatG,
      carbsG,
      alcoholG,
    };
  }

  if (modelCalories !== null) {
    return {
      calories: Math.round(modelCalories),
      caloriesIncomplete: false,
      proteinG,
      fatG,
      carbsG,
      alcoholG,
    };
  }

  return {
    calories: null,
    caloriesIncomplete: true,
    proteinG,
    fatG,
    carbsG,
    alcoholG,
  };
}

// Zod Schemas for LLM Output Verification
const focusAreaSchema = z.object({
  action: z.string().min(1),
  rationale: z.string().min(1),
});

const profileGapSchema = z.object({
  parameter: z.string().min(1),
  whyItMatters: z.string().min(1),
  improveAdvice: z.string().min(1),
});

const categoryStatusSchema = z.enum(["good", "watch"]);
const categoryAnalysisSchema = z.object({
  status: categoryStatusSchema,
  message: z.string().min(1),
});

const deeperCategoryExampleSchema = z.object({
  date: z.string().min(1),
  time: z.string().nullable(),
  parsedSummary: z.string().min(1),
  reason: z.string().min(1),
  confidence: z.number().nullable().optional(),
});

const deeperCategorySchema = z.object({
  status: categoryStatusSchema,
  message: z.string().min(1),
  examples: z.array(deeperCategoryExampleSchema),
});

const analysisReportPayloadSchema = z.object({
  summary: z.string().min(1),
  rootCauses: z.array(z.string().min(1)),
  focusAreas: z.array(focusAreaSchema),
  profileGaps: z.array(profileGapSchema),
  confidence: z.enum(["low", "medium", "high"]),
  waterAnalysis: categoryAnalysisSchema,
  calorieAnalysis: categoryAnalysisSchema,
  proteinAnalysis: categoryAnalysisSchema,
  macroAnalysis: categoryAnalysisSchema,
  loggingHabitAnalysis: deeperCategorySchema,
  mealChoiceAnalysis: deeperCategorySchema,
  exerciseHabitAnalysis: deeperCategorySchema,
});

function normalizeCategoryAnalysis(value, fallbackStatus, fallbackMessage) {
  const src = value && typeof value === "object" ? value : {};
  const statusValue = typeof src.status === "string" ? src.status.toLowerCase().trim() : "";
  const status = ["good", "watch"].includes(statusValue) ? statusValue : fallbackStatus;

  const messageCandidate =
    typeof src.message === "string" ? src.message.trim() :
    typeof src.insights === "string" ? src.insights.trim() :
    typeof src.recommendation === "string" ? src.recommendation.trim() :
    Array.isArray(src.alerts) ? src.alerts.map((item) => String(item).trim()).find(Boolean) ?? "" :
    "";

  return {
    status,
    message: messageCandidate || fallbackMessage,
  };
}

function normalizeDeeperCategoryAnalysis(value, fallbackStatus, fallbackMessage) {
  const src = value && typeof value === "object" ? value : {};
  const statusValue = typeof src.status === "string" ? src.status.toLowerCase().trim() : "";
  const status = ["good", "watch"].includes(statusValue) ? statusValue : fallbackStatus;

  const message = typeof src.message === "string" && src.message.trim().length > 0
    ? src.message.trim()
    : fallbackMessage;

  const rawExamples = Array.isArray(src.examples) ? src.examples : Array.isArray(src.rootCauses) ? src.rootCauses : [];
  const examples = rawExamples
    .map((item) => {
      const itemSrc = item && typeof item === "object" ? item : {};
      const date = typeof itemSrc.date === "string" ? itemSrc.date.trim() : "";
      const time = typeof itemSrc.time === "string" ? itemSrc.time.trim() : null;

      const parsedSummary = typeof itemSrc.parsedSummary === "string" ? itemSrc.parsedSummary.trim() :
                            typeof itemSrc.parsed_summary === "string" ? itemSrc.parsed_summary.trim() :
                            typeof itemSrc.parsedInfo === "string" ? itemSrc.parsedInfo.trim() :
                            typeof itemSrc.parsed_info === "string" ? itemSrc.parsed_info.trim() : "";

      const reason = typeof itemSrc.reason === "string" ? itemSrc.reason.trim() : "";

      let confidence = null;
      if (itemSrc.confidence !== undefined && itemSrc.confidence !== null) {
        const parsedConf = Number(itemSrc.confidence);
        if (Number.isFinite(parsedConf)) confidence = parsedConf;
      }

      return { date, time, parsedSummary, reason, confidence };
    })
    .filter((ex) => ex.date.length > 0 && ex.parsedSummary.length > 0);

  return {
    status,
    message,
    examples,
  };
}

// Normalizer implementation matching llm-normalizers.ts
function normalizeAnalysisReportResult(value) {
  const record = value && typeof value === "object" ? value : {};

  const summary = typeof record.summary === "string" ? record.summary.trim() : "";

  const rootCauses = Array.isArray(record.rootCauses)
    ? record.rootCauses.map((item) => typeof item === "string" ? item.trim() : "").filter(Boolean)
    : Array.isArray(record.root_causes)
      ? record.root_causes.map((item) => typeof item === "string" ? item.trim() : "").filter(Boolean)
      : [];

  const focusAreas = (Array.isArray(record.focusAreas) ? record.focusAreas : Array.isArray(record.focus_areas) ? record.focus_areas : [])
    .map((item) => {
      const src = item && typeof item === "object" ? item : {};
      const action = typeof src.action === "string" ? src.action.trim() : "";
      const rationale = typeof src.rationale === "string" ? src.rationale.trim() : "";
      return { action, rationale };
    })
    .filter((item) => item.action.length > 0);

  const profileGaps = (Array.isArray(record.profileGaps) ? record.profileGaps : Array.isArray(record.profile_gaps) ? record.profile_gaps : [])
    .map((item) => {
      const src = item && typeof item === "object" ? item : {};
      const parameter = typeof src.parameter === "string" ? src.parameter.trim() : typeof src.field === "string" ? src.field.trim() : "";
      const whyItMatters = typeof src.whyItMatters === "string" ? src.whyItMatters.trim() : typeof src.why_it_matters === "string" ? src.why_it_matters.trim() : "";
      const improveAdvice = typeof src.improveAdvice === "string" ? src.improveAdvice.trim() : typeof src.improve_advice === "string" ? src.improve_advice.trim() : typeof src.improveWith === "string" ? src.improveWith.trim() : "";
      return { parameter, whyItMatters, improveAdvice };
    })
    .filter((item) => item.parameter.length > 0);

  const confidenceValue = typeof record.confidence === "string" ? record.confidence.toLowerCase().trim() : "low";
  const confidence = ["low", "medium", "high"].includes(confidenceValue)
    ? confidenceValue
    : "low";

  const waterAnalysis = normalizeCategoryAnalysis(
    record.waterAnalysis,
    "watch",
    "Hydration needs a clearer read from the available logs.",
  );
  const calorieAnalysis = normalizeCategoryAnalysis(
    record.calorieAnalysis,
    "watch",
    "Calories need a clearer read from the available logs.",
  );
  const proteinAnalysis = normalizeCategoryAnalysis(
    record.proteinAnalysis,
    "watch",
    "Protein needs a clearer read from the available logs.",
  );
  const macroAnalysis = normalizeCategoryAnalysis(
    record.macroAnalysis,
    "watch",
    "Energy split needs a clearer read from the available logs.",
  );

  const loggingHabitAnalysis = normalizeDeeperCategoryAnalysis(
    record.loggingHabitAnalysis,
    "watch",
    "Logging habits need to be evaluated from more logs."
  );
  const mealChoiceAnalysis = normalizeDeeperCategoryAnalysis(
    record.mealChoiceAnalysis,
    "watch",
    "Meal choices need to be evaluated from more logs."
  );
  const exerciseHabitAnalysis = normalizeDeeperCategoryAnalysis(
    record.exerciseHabitAnalysis,
    "watch",
    "Exercise patterns need to be evaluated from more logs."
  );

  return {
    summary,
    rootCauses,
    focusAreas,
    profileGaps,
    confidence,
    waterAnalysis,
    calorieAnalysis,
    proteinAnalysis,
    macroAnalysis,
    loggingHabitAnalysis,
    mealChoiceAnalysis,
    exerciseHabitAnalysis,
  };
}

// Langfuse standard SDK usage mapping
function normalizeUsageMetadata(usageMetadata) {
  if (!usageMetadata) return undefined;
  const promptTokens = usageMetadata.promptTokenCount ?? null;
  const completionTokens =
    (usageMetadata.candidatesTokenCount ?? 0) + (usageMetadata.thoughtsTokenCount ?? 0) || null;
  const thoughtsTokens = usageMetadata.thoughtsTokenCount ?? null;
  const totalTokens = usageMetadata.totalTokenCount ?? null;

  const usageDetails = {};
  if (promptTokens !== null) usageDetails.input = promptTokens;
  if (completionTokens !== null) usageDetails.output = completionTokens;
  if (thoughtsTokens !== null) usageDetails.thoughts = thoughtsTokens;
  if (totalTokens !== null) usageDetails.total = totalTokens;

  return {
    promptTokens,
    completionTokens,
    thoughtsTokens,
    totalTokens,
    usageDetails: Object.keys(usageDetails).length ? usageDetails : undefined,
  };
}

// Serialization Helpers for Token Efficiency
function formatDateShort(dateStr) {
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  } catch {
    return dateStr;
  }
}

function serializeFoodItem(item) {
  const date = formatDateShort(item.date || (item.remarks && item.remarks.match(/Logged on ([\d-]+):/)?.[1]) || "");
  const qty = item.quantity ? ` (${item.quantity})` : "";
  const nut = item.nutrition || {};
  const macros = [];
  if (nut.proteinG) macros.push(`${nut.proteinG}g P`);
  if (nut.fatG) macros.push(`${nut.fatG}g F`);
  if (nut.carbsG) macros.push(`${nut.carbsG}g C`);
  if (nut.alcoholG) macros.push(`${nut.alcoholG}g Alc`);
  
  const macroStr = macros.length > 0 ? ` (${macros.join(", ")})` : "";
  const cals = nut.calories ? `${nut.calories} kcal` : "unknown cals";
  const rawNote = item.remarks ? item.remarks.replace(/^Logged on [\d-]+: /, "") : "";
  
  return `- [${date}] ${item.label}${qty}: ${cals}${macroStr} - ${rawNote}`;
}

function serializeWaterItem(item) {
  const date = formatDateShort(item.date || (item.remarks && item.remarks.match(/Logged on ([\d-]+):/)?.[1]) || "");
  const vol = item.waterMl ? `${item.waterMl} ml` : "unknown ml";
  const rawNote = item.remarks ? item.remarks.replace(/^Logged on [\d-]+: /, "") : "";
  return `- [${date}] ${item.label}: +${vol} - ${rawNote}`;
}

function serializeExerciseItem(item) {
  const date = formatDateShort(item.date || (item.remarks && item.remarks.match(/Logged on ([\d-]+):/)?.[1]) || "");
  const cals = item.exerciseCalories ? `${item.exerciseCalories} kcal` : "unknown cals";
  const rawNote = item.remarks ? item.remarks.replace(/^Logged on [\d-]+: /, "") : "";
  return `- [${date}] ${item.label}: -${cals} - ${rawNote}`;
}

async function run() {
  try {
    const todayStr = getTodayString();
    const past7Days = getPastDaysRange(todayStr);
    const startDate = past7Days[0];
    const endDate = past7Days[past7Days.length - 1];

    console.log(`[${ANALYSIS_PERIOD_DAYS}-Day Analysis] Today (Local User Time): ${todayStr}`);
    console.log(`[${ANALYSIS_PERIOD_DAYS}-Day Analysis] Target Period: ${startDate} to ${endDate}`);

    // 3. Fetch Profile
    const { data: dbProfile, error: profileErr } = await supabase
      .from("profile")
      .select("*")
      .limit(1)
      .maybeSingle();

    if (profileErr) throw profileErr;
    const profile = dbProfile || { country: "Singapore", goal: "None", metadata: {} };

    // 4. Fetch Active, Parsed Daily Entries in Target Range
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
    const parsedEntriesByDate = {};
    for (const entry of entries) {
      if (!parsedEntriesByDate[entry.entry_date]) {
        parsedEntriesByDate[entry.entry_date] = [];
      }
      parsedEntriesByDate[entry.entry_date].push(entry);
    }

    const completeDays = Object.keys(parsedEntriesByDate).sort();
    const completeDaysCount = completeDays.length;

    console.log(`[${ANALYSIS_PERIOD_DAYS}-Day Analysis] Found ${completeDaysCount} complete day(s) with active parsed entries.`);

    if (completeDaysCount === 0) {
      console.warn(`[${ANALYSIS_PERIOD_DAYS}-Day Analysis] No complete days found in the target period. Exiting.`);
      process.exit(0);
    }

    // 5. Fetch Daily Summaries for Complete Days
    const { data: dbSummaries, error: summariesErr } = await supabase
      .from("daily_summaries")
      .select("*")
      .in("entry_date", completeDays);

    if (summariesErr) throw summariesErr;
    const summaries = dbSummaries || [];
    const summariesByDate = Object.fromEntries(summaries.map(s => [s.entry_date, s]));

    // 6. Compute Deterministic Level 1 Stats
    let totalIntakeCalories = 0;
    let totalProteinG = 0;
    let totalFatG = 0;
    let totalCarbsG = 0;
    let totalAlcoholG = 0;
    let totalWaterMl = 0;
    let totalExerciseCalories = 0;
    let totalQuotaCalories = 0;
    let quotaDays = 0;

    for (const date of completeDays) {
      const summary = summariesByDate[date];
      if (summary) {
        totalIntakeCalories += summary.calories || 0;
        totalProteinG += summary.protein_g || 0;
        totalFatG += summary.fat_g || 0;
        totalCarbsG += summary.carbs_g || 0;
        totalAlcoholG += summary.alcohol_g || 0;
        totalWaterMl += summary.water_ml || 0;
        totalExerciseCalories += summary.exercise_calories || 0;
        
        if (summary.tdee) {
          totalQuotaCalories += summary.tdee;
          quotaDays++;
        }
      }
    }

    const averageIntakeCalories = Math.round(totalIntakeCalories / completeDaysCount);
    const averageQuotaCalories = quotaDays > 0 ? Math.round(totalQuotaCalories / quotaDays) : null;
    const averageNetCalories = averageQuotaCalories !== null ? Math.round(averageIntakeCalories - averageQuotaCalories) : null;
    
    const averageProteinG = Math.round((totalProteinG / completeDaysCount) * 10) / 10;
    const averageFatG = Math.round((totalFatG / completeDaysCount) * 10) / 10;
    const averageCarbsG = Math.round((totalCarbsG / completeDaysCount) * 10) / 10;
    const averageAlcoholG = Math.round((totalAlcoholG / completeDaysCount) * 10) / 10;
    const energySplit = buildAnalysisEnergySplit({
      averageProteinG,
      averageCarbsG,
      averageFatG,
      averageAlcoholG,
    });
    const averageWaterMl = Math.round(totalWaterMl / completeDaysCount);
    const averageExerciseCalories = Math.round(totalExerciseCalories / completeDaysCount);
    const consistencyScore = Math.round((completeDaysCount / ANALYSIS_PERIOD_DAYS) * 100) / 100;

    const stats = {
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
      energySplit,
      averageWaterMl,
      averageExerciseCalories,
      consistencyScore,
    };

    // 7. Extract Entry Evidence using derived nutrition logic
    const allItems = [];
    for (const date of completeDays) {
      const dayEntries = parsedEntriesByDate[date] || [];
      for (const entry of dayEntries) {
        const items = entry.parsed_items || [];
        for (const item of items) {
          // Normalize nutrition via deriveFoodNutrition logic if food kind
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
      .filter(item => item.kind === "food" && item.nutrition?.calories)
      .sort((a, b) => (b.nutrition?.calories || 0) - (a.nutrition?.calories || 0))
      .slice(0, 5)
      .map(item => ({
        kind: item.kind,
        label: item.label,
        quantity: item.quantity || null,
        confidence: item.confidence,
        nutrition: item.nutrition,
        remarks: `Logged on ${item.date}: "${item.sourceRawNote}"`,
      }));

    const alcoholContributors = allItems
      .filter(item => item.kind === "food" && item.nutrition?.alcoholG && item.nutrition.alcoholG > 0)
      .map(item => ({
        kind: item.kind,
        label: item.label,
        quantity: item.quantity || null,
        confidence: item.confidence,
        nutrition: item.nutrition,
        remarks: `Logged on ${item.date}: "${item.sourceRawNote}"`,
      }));

    const waterContributors = allItems
      .filter(item => item.kind === "water" || (item.waterMl && item.waterMl > 0))
      .map(item => ({
        kind: item.kind,
        label: item.label,
        quantity: item.quantity || null,
        confidence: item.confidence,
        waterMl: item.waterMl,
        remarks: `Logged on ${item.date}: "${item.sourceRawNote}"`,
      }));

    const exerciseContributors = allItems
      .filter(item => item.kind === "exercise" || (item.exerciseCalories && item.exerciseCalories > 0))
      .map(item => ({
        kind: item.kind,
        label: item.label,
        quantity: item.quantity || null,
        confidence: item.confidence,
        exerciseCalories: item.exerciseCalories,
        remarks: `Logged on ${item.date}: "${item.sourceRawNote}"`,
      }));

    const highCalorieLowProteinCandidates = allItems
      .filter(item => {
        if (item.kind !== "food") return false;
        const cals = item.nutrition?.calories || 0;
        const prot = item.nutrition?.proteinG || 0;
        return cals >= 300 && prot < 10;
      })
      .map(item => ({
        kind: item.kind,
        label: item.label,
        quantity: item.quantity || null,
        confidence: item.confidence,
        nutrition: item.nutrition,
        remarks: `Logged on ${item.date}: "${item.sourceRawNote}"`,
      }));

    const logTimeline = allItems.map(item => {
      let parsedInfo = "";
      if (item.kind === "food") {
        const nut = item.nutrition || {};
        const macros = [];
        if (nut.proteinG) macros.push(`${nut.proteinG}g P`);
        if (nut.fatG) macros.push(`${nut.fatG}g F`);
        if (nut.carbsG) macros.push(`${nut.carbsG}g C`);
        if (nut.alcoholG) macros.push(`${nut.alcoholG}g Alc`);
        const macroStr = macros.length > 0 ? ` (${macros.join(", ")})` : "";
        const cals = nut.calories ? `${nut.calories} kcal` : "unknown cals";
        parsedInfo = `${item.label}${item.quantity ? ` (${item.quantity})` : ""}: ${cals}${macroStr}`;
      } else if (item.kind === "water") {
        parsedInfo = `${item.label}: +${item.waterMl || 0}ml`;
      } else if (item.kind === "exercise") {
        parsedInfo = `${item.label}: -${item.exerciseCalories || 0} kcal`;
      } else {
        parsedInfo = `${item.label}`;
      }

      const time = item.occurredTime || null;

      return {
        date: item.date,
        time,
        rawNote: item.sourceRawNote || "",
        parsedInfo,
        confidence: item.confidence,
        warnings: item.warnings || [],
      };
    });

    const evidence = {
      topCalorieFoods,
      alcoholContributors,
      waterContributors,
      exerciseContributors,
      highCalorieLowProteinCandidates,
      logTimeline,
    };

    // 8. Package Prompt for Gemini 3.5 Flash
    const metadata = profile.metadata || {};
    const overrides = metadata.overrides || {};
    const memory = Array.isArray(metadata.memory) ? metadata.memory : [];

    const profileSummary = {
      age: profile.age,
      sex: profile.sex,
      heightCm: profile.heightCm ?? profile.height_cm,
      weightKg: profile.weightKg ?? profile.weight_kg,
      activityLevel: profile.activityLevel ?? profile.activity_level,
      goal: profile.goal,
      remarks: profile.remarks,
      overrides,
      profileMemoryContext: memory.map(m => ({
        category: m.category,
        label: m.label,
        value: m.value
      }))
    };
    const thresholdDays = Math.ceil(ANALYSIS_PERIOD_DAYS / 2);

    const prompt = `You are a personal health log analyst.
Review the following ${ANALYSIS_PERIOD_DAYS}-day health and fitness logs for a single user.
Do not recalculate or compute any sums or averages. The statistics have been computed deterministically and are 100% correct.
Your job is to provide behavioral interpretation, root-cause analysis, action areas, and diagnostic feedback on profile completeness.

CRITICAL GUARDRAIL: Do not generate medical diagnoses, make clinical claims, or provide unsupported general advice. Every insight and recommendation must be directly grounded in the provided numeric statistics and logs.

=== USER PROFILE & GOAL ===
${JSON.stringify(profileSummary, null, 2)}

=== ${ANALYSIS_PERIOD_DAYS}-DAY DETERMINISTIC STATISTICS ===
- Complete days logged: ${completeDaysCount} of ${ANALYSIS_PERIOD_DAYS} target days (Consistency: ${consistencyScore * 100}%)
- Intake Stats: ${JSON.stringify(stats, null, 2)}

IMPORTANT FOR ENERGY SPLIT:
- \`stats.energySplit\` is already the correct calorie-contribution decomposition.
- It uses protein = 4 kcal/g, carbs = 4 kcal/g, fat = 9 kcal/g, alcohol = 7 kcal/g.
- If alcohol is present, it is part of the energy split and should be treated as a calorie source.
- Do not infer this category from raw gram totals. Use \`stats.energySplit\` only.

=== ANOMALIES & CONTRIBUTORS EVIDENCE ===
- Top Calorie Foods:
${topCalorieFoods.map(serializeFoodItem).join("\n") || "None"}
- Alcohol logs:
${alcoholContributors.map(serializeFoodItem).join("\n") || "None"}
- Hydration logs:
${waterContributors.map(serializeWaterItem).join("\n") || "None"}
- Exercise logs:
${exerciseContributors.map(serializeExerciseItem).join("\n") || "None"}
- High-Calorie/Low-Protein Candidates (>300 kcal, <10g protein):
${highCalorieLowProteinCandidates.map(serializeFoodItem).join("\n") || "None"}

=== COMPLETE LOG TIMELINE ===
${logTimeline.map(item => {
  const timeStr = item.time ? ` at ${item.time}` : "";
  return `- [${item.date}${timeStr}] "${item.rawNote}" -> Parsed: ${item.parsedInfo}`;
}).join("\n") || "None"}

=== CRITICAL REQUIREMENT FOR LIMITED DATA ===
- If the number of complete days is LESS THAN ${thresholdDays} (we have ${completeDaysCount} days), the overall data is highly limited.
- In this case, you MUST set the confidence field to "low".
- You MUST also explicitly address this limited logging in all sections, recommending specific logging habits to gain a full 14-day picture.
- Even with limited data, category messages must still give a useful next step. Do not waste the short message on "limited data", "sparse tracking", or "need more days" unless there is no usable signal at all.

=== OUTPUT FORMAT ===
You must return a raw JSON object only. No markdown wrappers. Follow this exact JSON structure:
{
  "summary": "Short, clear plain-language summary of the overall 14-day outcome.",
  "rootCauses": [
    "Evidence-backed driver 1 (e.g. 'High calorie surplus on Tuesday driven by 1200 kcal burger entry')",
    "Evidence-backed driver 2 (e.g. 'Low protein average due to low protein content in top calorie items')"
  ],
  "focusAreas": [
    { "action": "Clear actionable step 1", "rationale": "Why this matches their goal based on evidence" },
    { "action": "Clear actionable step 2", "rationale": "Why this matches their goal based on evidence" }
  ],
  "profileGaps": [
    {
      "parameter": "Name of missing parameter",
      "whyItMatters": "Why this missing information limits precision",
      "improveAdvice": "Exact instruction to improve on the Profile screen"
    }
  ],
  "confidence": "low" | "medium" | "high",
  "waterAnalysis": {
    "status": "good" | "watch",
    "message": "One compact sentence, 5 to 12 words, including the takeaway and suggestion."
  },
  "calorieAnalysis": {
    "status": "good" | "watch",
    "message": "One compact sentence, 5 to 12 words, including the takeaway and suggestion."
  },
  "proteinAnalysis": {
    "status": "good" | "watch",
    "message": "One compact sentence, 5 to 12 words, including the takeaway and suggestion."
  },
  "macroAnalysis": {
    "status": "good" | "watch",
    "message": "One compact sentence, 5 to 12 words, including the takeaway and suggestion."
  },
  "loggingHabitAnalysis": {
    "status": "good" | "watch",
    "message": "One compact sentence assessing log frequency, specificity, and timestamping.",
    "examples": [
      {
        "date": "YYYY-MM-DD",
        "time": "HH:MM" or null,
        "parsedSummary": "Clean parsed summary of the item or action",
        "reason": "Why this specific log shows high/low specificity or timeliness",
        "confidence": number or null
      }
    ]
  },
  "mealChoiceAnalysis": {
    "status": "good" | "watch",
    "message": "One compact sentence on food-quality patterns (e.g. sugary items, fiber/vegetable gaps, repeated dense items).",
    "examples": [
      {
        "date": "YYYY-MM-DD",
        "time": "HH:MM" or null,
        "parsedSummary": "Clean parsed summary of the item or action",
        "reason": "Why this meal is evidence of quality or repeated dense patterns",
        "confidence": number or null
      }
    ]
  },
  "exerciseHabitAnalysis": {
    "status": "good" | "watch",
    "message": "One compact sentence on how logged exercise frequency and type aligns with goal.",
    "examples": [
      {
        "date": "YYYY-MM-DD",
        "time": "HH:MM" or null,
        "parsedSummary": "Clean parsed summary of the item or action",
        "reason": "Why this log is evidence of exercise alignment or gap",
        "confidence": number or null
      }
    ]
  }
}

STYLE RULES:
- Be crisp. Avoid filler, motivational fluff, and textbook explanations.
- Write like a smart coach giving a fast read, not an article.
- Use only two status states: "good" and "watch".
- The UI shows the main numbers separately. Use the message as the entire displayed sentence for saved reports.
- If a category is fine, say why briefly and stop.
- Do not return separate alerts, assessments, recommendations, or multi-part coaching inside category objects.
- For macroAnalysis, describe calorie-source decomposition, not gram balance. Mention alcohol share when it matters.
- For "watch", include a concrete next-step suggestion.
- For "good", reinforce what is working in a short way.
- Do not complain about limited data inside category messages when a real signal exists.
- Avoid repeating all the numbers already shown in the UI.
- Keep each category message to one sentence only.
- For "examples" arrays in deeper analysis objects, provide up to 3 real, specific log items as evidence. Do not make up examples that do not exist in the COMPLETE LOG TIMELINE.
- Do NOT output "rawNote" or "raw_note" inside the examples. Use "parsedSummary" instead to describe the log item cleanly (e.g., "Egg fried rice (600 kcal)" or "+400ml water").
- Ensure the mealChoiceAnalysis message addresses food-quality patterns (sugar, fried foods, fiber/veggies, protein pairing, alcohol, snack density) directly.
- Ensure the loggingHabitAnalysis message addresses log frequency, specificity, and timestamping directly.
- Ensure the exerciseHabitAnalysis message addresses how logged exercise frequency/type aligns with the user's goal directly.
`;

    console.log(`[${ANALYSIS_PERIOD_DAYS}-Day Analysis] Calling Gemini Model: ${MODEL_NAME}...`);
    const started = Date.now();
    let trace = null;
    if (langfuse) {
      trace = langfuse.trace({
        name: `healthlog-${ANALYSIS_PERIOD_DAYS}day-analysis`,
        metadata: { model: MODEL_NAME, promptVersion: PROMPT_VERSION, completeDaysCount },
      });
    }

    const result = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
      },
    });

    const responseText = result.text ?? "{}";
    const latencyMs = Date.now() - started;
    console.log(`[${ANALYSIS_PERIOD_DAYS}-Day Analysis] Gemini response received in ${latencyMs}ms.`);

    const parsedResponse = JSON.parse(responseText.trim().replace(/^```json\s*/, "").replace(/\s*```$/, ""));
    const normalizedInsights = normalizeAnalysisReportResult(parsedResponse);
    
    // Construct final combined analysis report payload
    let confidenceText = normalizedInsights.confidence;
    if (completeDaysCount < thresholdDays) {
      console.log(`[${ANALYSIS_PERIOD_DAYS}-Day Analysis] Forcing 'low' confidence due to limited data (<${thresholdDays} complete days).`);
      confidenceText = "low";
    }
    const numericConfidence = mapConfidenceTextToNumeric(confidenceText);

    const payload = {
      stats,
      evidence,
      ...normalizedInsights,
      confidence: confidenceText,
    };

    // Seal the data contract with exact Zod validation
    const validatedPayload = analysisReportPayloadSchema.parse(payload);

    // Langfuse Observation Logging with strict usage metadata
    const usageMetadata = normalizeUsageMetadata(result.usageMetadata);
    if (trace) {
      trace.generation({
        name: "analysis-experiment",
        model: MODEL_NAME,
        input: prompt,
        output: responseText,
        metadata: { latencyMs, promptVersion: PROMPT_VERSION, usage: usageMetadata },
        usage: usageMetadata
          ? {
              promptTokens: usageMetadata.promptTokens,
              completionTokens: usageMetadata.completionTokens,
              totalTokens: usageMetadata.totalTokens,
            }
          : undefined,
        usageDetails: usageMetadata?.usageDetails,
      });
      await langfuse.flushAsync();
    }

    // Write LLM Audit Run Row including precise Gemini Usage metadata
    const inputHash = createHash("sha256")
      .update(JSON.stringify({ version: PROMPT_VERSION, stats, evidence }))
      .digest("hex");

    await supabase.from("llm_runs").insert({
      prompt_version: PROMPT_VERSION,
      scenario: "analysis_experiment",
      model: MODEL_NAME,
      input_hash: inputHash,
      request_summary: {
        stats,
        profileSummary,
        latencyMs,
        usage: usageMetadata ?? null,
      },
      output_json: validatedPayload,
      latency_ms: latencyMs,
      success: true,
    });

    // Save final validated combined analysis report payload
    const { error: saveError } = await supabase
      .from("analysis_reports")
      .insert({
        period_start: startDate,
        period_end: endDate,
        report_type: "weekly",
        payload: validatedPayload,
        confidence: numericConfidence,
      });

    if (saveError) {
      console.error(`[${ANALYSIS_PERIOD_DAYS}-Day Analysis] Failed to save analysis report to Supabase:`, saveError);
      throw saveError;
    }

    console.log(`[${ANALYSIS_PERIOD_DAYS}-Day Analysis] Successfully generated and stored the ${ANALYSIS_PERIOD_DAYS}-day analysis report!`);
    process.exit(0);

  } catch (error) {
    console.error(`[${ANALYSIS_PERIOD_DAYS}-Day Analysis] Error running analysis script:`, error);
    process.exit(1);
  }
}

run();
