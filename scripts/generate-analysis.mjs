import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";
import { Langfuse } from "langfuse";
import { createHash } from "node:crypto";
import { z } from "zod";

const PROMPT_VERSION = "2026-05-27-analysis-v2";
const MODEL_NAME = "gemini-3.5-flash";

const ANALYSIS_PERIOD_DAYS = Number(process.env.ANALYSIS_PERIOD_DAYS) || 7;

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

const analysisReportPayloadSchema = z.object({
  stats: z.any(),
  evidence: z.any(),
  summary: z.string().min(1),
  rootCauses: z.array(z.string().min(1)),
  focusAreas: z.array(focusAreaSchema),
  profileGaps: z.array(profileGapSchema),
  confidence: z.enum(["low", "medium", "high"]),
});

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

  return {
    summary,
    rootCauses,
    focusAreas,
    profileGaps,
    confidence,
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

    const evidence = {
      topCalorieFoods,
      alcoholContributors,
      waterContributors,
      exerciseContributors,
      highCalorieLowProteinCandidates,
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

=== CRITICAL REQUIREMENT FOR LIMITED DATA ===
- If the number of complete days is LESS THAN ${thresholdDays} (we have ${completeDaysCount} days), the overall data is highly limited.
- In this case, you MUST set the confidence field to "low".
- You MUST also explicitly address this limited logging in the "summary" and under "profileGaps" or "rootCauses", recommending specific logging habits to gain a full weekly picture.

=== OUTPUT FORMAT ===
You must return a raw JSON object only. No markdown wrappers. Follow this exact JSON structure:
{
  "summary": "Short, clear plain-language summary of the week's nutritional outcome. Focus heavily on how outcomes relate directly to the user's goals (e.g. fat loss, maintenance, muscle gain, hydration). Highlight the limited data if complete days are < ${thresholdDays}.",
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
      "parameter": "Name of missing parameter (e.g. Height, Weight, Activity Level, Goals)",
      "whyItMatters": "Why this missing information limits precision (e.g., MSJ BMR formula requires this for baseline energy quota)",
      "improveAdvice": "Exact instruction to improve (e.g., 'Update your age and sex on the Profile screen to activate Mifflin-St Jeor formulas')"
    }
  ],
  "confidence": "low" | "medium" | "high"
}
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
