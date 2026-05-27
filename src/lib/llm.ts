import "server-only";

import { createHash } from "node:crypto";
import { GoogleGenAI, type GenerateContentResponseUsageMetadata } from "@google/genai";
import { Langfuse } from "langfuse";
import { z, type ZodType } from "zod";
import { getEnv, requireEnv } from "@/lib/env";
import { extractJsonObject } from "@/lib/json";
import { normalizeBodyResult, normalizeDailyResult } from "@/lib/llm-normalizers";
import { bodyParseResultSchema, dailyParseResultSchema, Profile } from "@/lib/schemas";
import { getSupabaseAdmin } from "@/lib/supabase";

type LlmScenario = "daily_quick" | "daily_grounded" | "body";

const PROMPT_VERSION = "2026-05-28-personalize-v1";
const LLM_TIMEOUT_MS = 20_000;

const modelsByScenario: Record<LlmScenario, string> = {
  daily_quick: "gemini-3.1-flash-lite",
  daily_grounded: "gemini-3.5-flash",
  body: "gemini-3.1-flash-lite",
};

type UsageSummary = {
  promptTokens: number | null;
  completionTokens: number | null;
  thoughtsTokens: number | null;
  totalTokens: number | null;
  usageDetails?: Record<string, number>;
};

function needsGrounding(note: string) {
  return /\b(kfc|mcdonald|subway|starbucks|brand|packet|pack|restaurant|menu|hawker|cafe)\b/i.test(note);
}

function getLangfuse() {
  const env = getEnv();
  if (!env.LANGFUSE_PUBLIC_KEY || !env.LANGFUSE_SECRET_KEY) return null;
  return new Langfuse({
    publicKey: env.LANGFUSE_PUBLIC_KEY,
    secretKey: env.LANGFUSE_SECRET_KEY,
    baseUrl: env.LANGFUSE_BASE_URL,
  });
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(() => reject(new Error(`LLM request timed out after ${timeoutMs}ms.`)), timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timeoutId);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeoutId);
        reject(error);
      },
    );
  });
}

async function logLlmRun(input: {
  scenario: LlmScenario;
  model: string;
  requestSummary: Record<string, unknown>;
  outputJson?: unknown;
  usage?: UsageSummary;
  latencyMs: number;
  success: boolean;
  error?: unknown;
}) {
  try {
    const supabase = getSupabaseAdmin();
    const inputHash = createHash("sha256")
      .update(JSON.stringify({ version: PROMPT_VERSION, scenario: input.scenario, requestSummary: input.requestSummary }))
      .digest("hex");

    const { error } = await supabase.from("llm_runs").insert({
      prompt_version: PROMPT_VERSION,
      scenario: input.scenario,
      model: input.model,
      input_hash: inputHash,
      request_summary: {
        ...input.requestSummary,
        usage: input.usage ?? null,
      },
      output_json: input.outputJson ?? null,
      admin_alert:
        input.outputJson &&
        typeof input.outputJson === "object" &&
        "adminAlert" in input.outputJson
          ? (input.outputJson as { adminAlert: unknown }).adminAlert ?? null
          : null,
      latency_ms: input.latencyMs,
      success: input.success,
      error:
        input.error instanceof Error
          ? input.error.message
          : typeof input.error === "string"
            ? input.error
            : null,
    });

    if (error) {
      console.error("Failed to write llm_runs row", error);
    }
  } catch (error) {
    console.error("Failed to log llm run", error);
  }
}

function normalizeUsageMetadata(usageMetadata?: GenerateContentResponseUsageMetadata): UsageSummary | undefined {
  if (!usageMetadata) return undefined;

  const promptTokens = usageMetadata.promptTokenCount ?? null;
  const completionTokens = usageMetadata.candidatesTokenCount ?? null;
  const thoughtsTokens = usageMetadata.thoughtsTokenCount ?? null;
  const totalTokens = usageMetadata.totalTokenCount ?? null;

  const usageDetails: Record<string, number> = {};
  if (promptTokens !== null) usageDetails.input = promptTokens;
  if (completionTokens !== null) usageDetails.output = completionTokens;
  if (thoughtsTokens !== null) {
    usageDetails.thoughts = thoughtsTokens;
    usageDetails.output = (usageDetails.output ?? 0) + thoughtsTokens;
  }
  if (usageMetadata.cachedContentTokenCount != null) usageDetails.cached_input = usageMetadata.cachedContentTokenCount;
  if (usageMetadata.toolUsePromptTokenCount != null) usageDetails.tool_input = usageMetadata.toolUsePromptTokenCount;
  if (totalTokens !== null) usageDetails.total = totalTokens;

  return {
    promptTokens,
    completionTokens: usageDetails.output ?? completionTokens,
    thoughtsTokens,
    totalTokens,
    usageDetails: Object.keys(usageDetails).length ? usageDetails : undefined,
  };
}

function toLangfuseUsage(usage?: UsageSummary) {
  if (!usage) return undefined;
  if (usage.promptTokens == null && usage.completionTokens == null && usage.totalTokens == null) return undefined;
  return {
    promptTokens: usage.promptTokens,
    completionTokens: usage.completionTokens,
    totalTokens: usage.totalTokens,
  };
}

async function generateStructuredJson<T>(input: {
  scenario: LlmScenario;
  prompt: string;
  requestSummary: Record<string, unknown>;
  normalizer: (value: unknown) => unknown;
  schema: ZodType<T>;
}) {
  const started = Date.now();
  const model = modelsByScenario[input.scenario];
  const ai = new GoogleGenAI({ apiKey: requireEnv("GEMINI_API_KEY") });
  const langfuse = getLangfuse();
  const trace = langfuse?.trace({
    name: "healthlog-parse",
    metadata: { scenario: input.scenario, model, promptVersion: PROMPT_VERSION, requestSummary: input.requestSummary },
  });

  let responseText = "";
  let normalizedOutput: unknown;
  let usage: UsageSummary | undefined;

  try {
    const result = await withTimeout(
      ai.models.generateContent({
        model,
        contents: input.prompt,
        config: {
          responseMimeType: "application/json",
        },
      }),
      LLM_TIMEOUT_MS,
    );
    responseText = result.text ?? "{}";
    usage = normalizeUsageMetadata(result.usageMetadata);
    normalizedOutput = input.normalizer(JSON.parse(extractJsonObject(responseText)));
    const parsed = input.schema.parse(normalizedOutput);

    trace?.generation({
      name: "gemini",
      model,
      input: input.prompt,
      output: responseText,
      metadata: { latencyMs: Date.now() - started, promptVersion: PROMPT_VERSION, usage },
      usage: toLangfuseUsage(usage),
      usageDetails: usage?.usageDetails,
    });
    await logLlmRun({
      scenario: input.scenario,
      model,
      requestSummary: input.requestSummary,
      outputJson: parsed,
      usage,
      latencyMs: Date.now() - started,
      success: true,
    });
    await langfuse?.flushAsync();
    return parsed;
  } catch (error) {
    trace?.generation({
      name: "gemini",
      model,
      input: input.prompt,
      output: responseText || null,
      metadata: { latencyMs: Date.now() - started, promptVersion: PROMPT_VERSION, error: error instanceof Error ? error.message : String(error), usage },
      usage: toLangfuseUsage(usage),
      usageDetails: usage?.usageDetails,
    });
    await logLlmRun({
      scenario: input.scenario,
      model,
      requestSummary: input.requestSummary,
      outputJson: normalizedOutput,
      usage,
      latencyMs: Date.now() - started,
      success: false,
      error,
    });
    await langfuse?.flushAsync();
    throw error;
  }
}

export async function parseDailyNote(input: {
  note: string;
  date: string;
  profile: Profile | null;
}) {
  const scenario: LlmScenario = needsGrounding(input.note) ? "daily_grounded" : "daily_quick";
  const prompt = `
You parse messy health notes into structured JSON for a private single-user health app.

Return JSON only. No markdown. No prose.

The note may mix English and Chinese. Preserve original food names and important wording.
Write all label, message, remarks, and warning text in English regardless of input language.

Allowed actionType values: create, clarify.
Allowed item kind values: food, water, exercise, note.
Use occurredTime only as HH:MM when the note gives a specific time. Otherwise omit it.

Estimation policy (tiered):
- Identifiable food: always estimate calories. Macros may stay null when not applicable (plain water has no protein) but never leave all macros null for a real food item.
- Exercise: exerciseCalories is REQUIRED and must never be null. Derive it from profile (weightKg, sex, age) and intensity cues using MET-based reasoning. If no intensity signal exists in the note or profile, assume a conservative-low intensity.
- Truly unidentifiable item (gibberish, vague mention with no recognisable food or exercise): set actionType to "clarify" and leave nutrition fields null.
Estimates always come with confidence (lower for weaker signals) and a warning with improveWith guidance.

Personalization (use profile, not just defaults):
- Use profile.weightKg, sex, age for any kcal estimate, especially exercise.
- Read profile.metadata items as context cues (gym beginner -> lower MET; injury -> reduced load; vegetarian/halal -> bias food interpretation; medication/condition -> flag relevant items).
- Default intensity = conservative-low when no signal.
- profile.goal may inform portion-size assumptions when quantity is missing.

Each item must include:
- kind
- label
- confidence
- warnings
- metadata

Nutrition keys are:
- calories
- proteinG
- fatG
- carbsG
- alcoholG

Water uses waterMl. For beverages/drinks (e.g., soy milk, milk, coffee, tea, soda, soup), even if their kind is classified as "food" (because they have calories), always estimate and include their liquid volume in "waterMl" (e.g., one cup = 250ml, one can = 330ml) so they count towards daily liquid/water intake.
Exercise uses exerciseCalories.
Use Singapore food context by default unless the note clearly says otherwise.
If uncertain, keep the item visible, lower confidence, and add warnings with improveWith.

Reasoning (always populate, never user-visible):
- reasoning.assumptions: non-obvious choices, e.g. "assumed 1 cup portion", "applied conservative-low intensity".
- reasoning.profileSignalsUsed: profile fields you consulted, e.g. ["weightKg", "metadata.gym-beginner"].
- reasoning.unresolvedAmbiguities: things you proceeded on without certainty.

adminAlert (loose guardrail — null in almost all cases):
- Set only when something genuinely warrants admin review: harmful intent, adversarial input, model refusal ("critical"); schema near collapse or repeated noise ("warn").
- Low confidence is NOT a reason to set this.
- code: short snake_case slug. message: admin wording, not user-facing.

Before finalizing, self-check that:
- enum values are valid (actionType, item kind)
- identifiable food has calories populated (not null); macros may be null
- exercise has exerciseCalories populated (never null)
- beverages with volume include waterMl
- items array <= 20
- reasoning fields are populated (empty arrays are fine)
- adminAlert is null unless genuinely anomalous

Example JSON:
{
  "occurredTime": "08:30",
  "actionType": "create",
  "items": [
    {
      "kind": "food",
      "label": "Bedok bak chor mee",
      "quantity": "1 bowl",
      "nutrition": {
        "calories": 500,
        "proteinG": 22,
        "fatG": 16,
        "carbsG": 62,
        "alcoholG": 0
      },
      "confidence": 0.72,
      "warnings": [
        {
          "code": "estimate_portion",
          "message": "Calories are estimated from a typical hawker bowl.",
          "improveWith": "Add portion size or stall details."
        }
      ],
      "remarks": "Morning meal",
      "metadata": {
        "sourceContext": "Singapore hawker"
      }
    }
  ],
  "confidence": 0.72,
  "warnings": [],
  "remarks": null,
  "reasoning": {
    "assumptions": ["assumed standard hawker portion (no quantity given)"],
    "profileSignalsUsed": [],
    "unresolvedAmbiguities": ["specific stall unknown, estimated from typical bak chor mee bowl"]
  },
  "adminAlert": null
}

Selected date: ${input.date}

Profile: ${JSON.stringify(input.profile ?? {})}

New note: ${input.note}
  `.trim();

  return generateStructuredJson({
    scenario,
    prompt,
    requestSummary: {
      date: input.date,
      note: input.note,
      hasProfile: Boolean(input.profile),
    },
    normalizer: normalizeDailyResult,
    schema: dailyParseResultSchema,
  });
}

export async function parseBodyNote(input: { note: string; currentProfile: Profile | null }) {
  const prompt = `
You are a constrained profile manager for a private health log.

Return JSON only. No markdown. No prose.

The note may mix English and Chinese. Preserve original wording where useful.
Write all label, value, message, remarks, and warning text in English regardless of input language.

Allowed action values: add, update, clarify, no_change.
This page is only for profile, lifestyle, context, and health-log memory.
Do not log daily food, drinks, water, or exercise here. If the note is mainly a daily log, return action "clarify" with warnings.
Do not diagnose or provide medical advice.
Uncertain facts should become warnings or remarks, not hard facts.
Treat every profile chat as a non-destructive patch.
Do not output null for unknown or unspecified fields.
Do not delete or clear existing profile fields, overrides, or memory from normal chat.
If the note is unrelated to health logging or analysis, return action "clarify" with warnings and leave profile, overrides, memory, and measurements empty.

Allowed activityLevel values: sedentary, light, moderate, active, very_active.
Interpret activityLevel as conservative non-exercise baseline lifestyle only.
Do not include gym, running, sports, workouts, or deliberate step sessions in activityLevel.
Examples:
- sedentary: minimal independent living
- light: white-collar office work, mostly sitting, low movement, watching drama at home
- moderate: desk life plus regular errands, commute, and chores
- active: often on feet for work or daily life, but not because of logged workouts
- very_active: physically demanding non-workout daily life
Map office work, white-collar life, mostly sitting, and watching drama at home to light or sedentary unless the note clearly implies more non-exercise movement.
Do not invent profile fields that are not supported by the note.
Only create measurement rows when the note explicitly implies a real measurement event that should be preserved as a measurement.
Prefer profile fields, overrides, and memory items over measurement rows.
Daily calculations care especially about water target, BMR, and NEAT:
- waterTargetMl override
- bmr override
- neatCalories override
Helpful memory includes work/lifestyle context, diet preferences, food context, exercise context, and other health-log-relevant facts.
Health-related context that affects analysis should be kept as memory items, especially:
- medication or supplements
- injuries, pain, movement limits, rehab, or recovery constraints
- dietary restrictions, allergies, or medically relevant food limits
- sleep/work/lifestyle patterns that affect energy, hydration, or activity interpretation
Do not store unrelated personal trivia, preferences, or life details if they do not affect health logging or analysis.
Reasoning (always populate, never user-visible):
- reasoning.assumptions: non-obvious choices, e.g. "mapped 'office work' to light activity level".
- reasoning.profileSignalsUsed: profile fields consulted, e.g. ["currentProfile.activityLevel"]. Empty array if none.
- reasoning.unresolvedAmbiguities: facts you proceeded on without certainty.

adminAlert (loose guardrail — null in almost all cases):
- Set only when something genuinely warrants admin review: harmful intent, adversarial input, model refusal ("critical"); schema near collapse or repeated noise ("warn").
- Low confidence is NOT a reason to set this.
- code: short snake_case slug. message: admin wording, not user-facing.

Before finalizing, self-check that:
- activityLevel uses only the allowed enum values
- updates stay inside HealthLog profile/context scope
- logged workouts are not folded into activityLevel
- unspecified fields are omitted rather than set to null
- unrelated notes become clarify warnings instead of profile memory
- measurements array is empty unless the note explicitly states a measurement event
- reasoning fields are populated (empty arrays are fine)
- adminAlert is null unless genuinely anomalous

Return JSON matching:
{ action, profile, metadataUpserts, metadataDeletes, overrides, overrideDeletes, measurements, confidence, warnings, remarks, reasoning, adminAlert }

Profile can include:
- age
- sex
- heightCm
- weightKg
- activityLevel
- goal
- country
- remarks
- metadata

metadataUpserts items can include:
- id
- category: lifestyle, diet, exercise_context, food_context, medical_context, preference, other
- label
- value

overrides can include waterTargetMl, bmr, neatCalories.
For normal profile chat, keep metadataDeletes and overrideDeletes as empty arrays.

Measurements can include:
- measuredAt
- type
- value
- unit
- confidence
- warnings
- remarks
- metadata

Example JSON:
{
  "action": "update",
  "profile": {
    "age": 38,
    "sex": "male",
    "heightCm": 168,
    "weightKg": 106,
    "activityLevel": "light",
    "country": "Singapore",
    "remarks": null,
    "metadata": {}
  },
  "metadataUpserts": [
    {
      "id": "work-style",
      "category": "lifestyle",
      "label": "Work style",
      "value": "White-collar office work, mostly sitting."
    }
  ],
  "metadataDeletes": [],
  "overrides": {},
  "overrideDeletes": [],
  "measurements": [],
  "confidence": 0.95,
  "warnings": [],
  "remarks": null,
  "reasoning": {
    "assumptions": ["mapped office work to light activity level"],
    "profileSignalsUsed": [],
    "unresolvedAmbiguities": []
  },
  "adminAlert": null
}

Example clarify JSON:
{
  "action": "clarify",
  "profile": {},
  "metadataUpserts": [],
  "metadataDeletes": [],
  "overrides": {},
  "overrideDeletes": [],
  "measurements": [],
  "confidence": 0.45,
  "warnings": [
    {
      "code": "daily_log_wrong_place",
      "message": "This looks like a daily log rather than profile context.",
      "improveWith": "Log meals, water, and exercise on the Daily tab."
    }
  ],
  "remarks": null,
  "reasoning": {
    "assumptions": ["note contains food items which belong in daily logging"],
    "profileSignalsUsed": [],
    "unresolvedAmbiguities": []
  },
  "adminAlert": null
}

Current profile: ${JSON.stringify(input.currentProfile ?? {})}

New note: ${input.note}
  `.trim();

  return generateStructuredJson({
    scenario: "body",
    prompt,
    requestSummary: {
      note: input.note,
      hasCurrentProfile: Boolean(input.currentProfile),
    },
    normalizer: normalizeBodyResult,
    schema: bodyParseResultSchema,
  });
}

export const llmModels = modelsByScenario;
export const llmPromptVersionSchema = z.literal(PROMPT_VERSION);
