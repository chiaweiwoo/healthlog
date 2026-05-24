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

const PROMPT_VERSION = "2026-05-25-hardening-v1";
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
  return Promise.race<T>([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(`LLM request timed out after ${timeoutMs}ms.`)), timeoutMs);
    }),
  ]);
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
  activeEntries: Array<{ id: string; raw_note: string; parsed_items: unknown[]; parse_status?: string }>;
}) {
  const scenario: LlmScenario = needsGrounding(input.note) ? "daily_grounded" : "daily_quick";
  const prompt = `
You parse messy health notes into structured JSON for a private single-user health app.

Return JSON only. No markdown. No prose.

The note may mix English and Chinese. Preserve original food names and important wording.

Allowed actionType values: create, edit, delete, clarify.
Allowed item kind values: food, water, exercise, note.
Use occurredTime only as HH:MM when the note gives a specific time. Otherwise omit it.
Do not silently convert unknown nutrition into zero. Unknown values must stay null.

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

Water uses waterMl.
Exercise uses exerciseCalories.
Use Singapore food context by default unless the note clearly says otherwise.
For common Singapore foods, provide a reasonable estimate with confidence when possible.
If uncertain, keep the item visible, lower confidence, and add warnings with improveWith.
Before finalizing, self-check that actionType and item kinds use only the allowed enum values.

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
        "carbsG": 62
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
  "remarks": null
}

Selected date: ${input.date}

Profile: ${JSON.stringify(input.profile ?? {})}

Current active entries: ${JSON.stringify(
    input.activeEntries.map((entry) => ({
      id: entry.id,
      rawNote: entry.raw_note,
      parsedItems: entry.parsed_items,
      parseStatus: entry.parse_status ?? "parsed",
    })),
  )}

New note: ${input.note}
  `.trim();

  return generateStructuredJson({
    scenario,
    prompt,
    requestSummary: {
      date: input.date,
      note: input.note,
      activeEntryCount: input.activeEntries.length,
      hasProfile: Boolean(input.profile),
    },
    normalizer: normalizeDailyResult,
    schema: dailyParseResultSchema,
  });
}

export async function parseBodyNote(input: { note: string; currentProfile: Profile | null }) {
  const prompt = `
You parse body and profile notes into structured JSON for a private health log.

Return JSON only. No markdown. No prose.

The note may mix English and Chinese. Preserve original wording where useful.

Allowed activityLevel values: sedentary, light, moderate, active, very_active.
Do not invent profile fields that are not supported by the note.
Only create measurement rows when the note implies a real measurement event.
Use weight measurements when a body weight is stated. Height should normally update the profile only.
Before finalizing, self-check that activityLevel uses only the allowed enum values.

Return JSON matching:
{ profile, measurements, confidence, warnings, remarks }

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
  "measurements": [
    {
      "measuredAt": "2026-05-25T08:00:00Z",
      "type": "weight",
      "value": 106,
      "unit": "kg",
      "confidence": 0.95,
      "remarks": null,
      "metadata": {}
    }
  ],
  "confidence": 0.95,
  "warnings": [],
  "remarks": null
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
