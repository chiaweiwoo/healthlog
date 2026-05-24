import "server-only";

import { GoogleGenAI } from "@google/genai";
import { Langfuse } from "langfuse";
import { getEnv, requireEnv } from "@/lib/env";
import { extractJsonObject } from "@/lib/json";
import { normalizeBodyResult, normalizeDailyResult } from "@/lib/llm-normalizers";
import { bodyParseResultSchema, dailyParseResultSchema, Profile } from "@/lib/schemas";

type LlmScenario = "daily_quick" | "daily_grounded" | "body";

const modelsByScenario: Record<LlmScenario, string> = {
  daily_quick: "gemini-2.5-flash-lite",
  daily_grounded: "gemini-2.5-flash",
  body: "gemini-2.5-flash-lite",
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

async function generateJson(scenario: LlmScenario, prompt: string) {
  const started = Date.now();
  const model = modelsByScenario[scenario];
  const ai = new GoogleGenAI({ apiKey: requireEnv("GEMINI_API_KEY") });
  const langfuse = getLangfuse();
  const trace = langfuse?.trace({
    name: "healthlog-parse",
    metadata: { scenario, model },
  });

  try {
    const result = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
      },
    });
    const text = result.text ?? "{}";
    trace?.generation({
      name: "gemini",
      model,
      input: prompt,
      output: text,
      metadata: { latencyMs: Date.now() - started },
    });
    await langfuse?.flushAsync();
    return JSON.parse(extractJsonObject(text)) as unknown;
  } catch (error) {
    await langfuse?.flushAsync();
    throw error;
  }
}

export async function parseDailyNote(input: {
  note: string;
  date: string;
  profile: Profile | null;
  activeEntries: unknown[];
}) {
  const scenario: LlmScenario = needsGrounding(input.note) ? "daily_grounded" : "daily_quick";
  const prompt = `
You parse messy health notes into structured JSON for a private single-user app.

The note may mix English and Chinese. Preserve original food names and important wording.

Use actionType only from: create, edit, delete, clarify.

Use occurredTime only as HH:MM if the note gives a specific time. Otherwise omit it.

Each item must include: kind, label, confidence, warnings, metadata.

Return only JSON matching this shape: { occurredTime, actionType, items, confidence, warnings, remarks }.

Items use kind food/water/exercise/note. Preserve important details in remarks or metadata. Do not invent precision.

Nutrition keys are calories, proteinG, fatG, carbsG. Water uses waterMl. Exercise uses exerciseCalories.

Use Singapore food context by default unless the note says otherwise.

If uncertain, keep the item visible, lower confidence, and add warnings with improveWith.

Selected date: ${input.date}

Profile: ${JSON.stringify(input.profile ?? {})}

Current active entries: ${JSON.stringify(input.activeEntries)}

New note: ${input.note}
  `.trim();

  return dailyParseResultSchema.parse(normalizeDailyResult(await generateJson(scenario, prompt)));
}

export async function parseBodyNote(input: { note: string; currentProfile: Profile | null }) {
  const prompt = `
You parse body/profile notes into structured JSON for a private health log.

The note may mix English and Chinese. Preserve original wording where useful.

Use activityLevel only from: sedentary, light, moderate, active, very_active.

Return only JSON matching this shape: { profile, measurements, confidence, warnings, remarks }.

Profile can include age, sex, heightCm, weightKg, activityLevel, goal, country, remarks, metadata.

Measurements use measuredAt, type, value, unit, confidence, remarks, metadata.

Preserve uncertainty and important remarks. Do not invent missing body profile fields.

Current profile: ${JSON.stringify(input.currentProfile ?? {})}

New note: ${input.note}
  `.trim();

  return bodyParseResultSchema.parse(normalizeBodyResult(await generateJson("body", prompt)));
}
