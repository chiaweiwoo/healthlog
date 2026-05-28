import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";

const MODEL_NAME = "gemini-3.5-flash";
const INSIGHTS_DAYS = Number(process.env.INSIGHTS_DAYS) || 7;
const TRIGGERED_BY = process.env.INSIGHTS_TRIGGERED_BY || "manual";

const requiredEnv = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "GEMINI_API_KEY"];
for (const key of requiredEnv) {
  if (!process.env[key]) {
    console.error(`Missing required environment variable: ${key}`);
    process.exit(1);
  }
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  db: { schema: "healthlog" },
});

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

function percentile(sorted, p) {
  if (!sorted.length) return null;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function topN(map, n = 10) {
  return [...map.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, n)
    .map(([text, data]) => ({ text, ...data }));
}

function incrementMap(map, key, sample = null) {
  const existing = map.get(key) ?? { count: 0, samples: [] };
  existing.count++;
  if (sample && existing.samples.length < 3) existing.samples.push(sample);
  map.set(key, existing);
}

async function run() {
  try {
    const windowEnd = new Date();
    const windowStart = new Date(windowEnd.getTime() - INSIGHTS_DAYS * 24 * 60 * 60 * 1000);

    console.log(`[prompt-insights] Window: ${windowStart.toISOString()} → ${windowEnd.toISOString()}`);
    console.log(`[prompt-insights] Querying llm_runs...`);

    const { data: rows, error } = await supabase
      .from("llm_runs")
      .select("prompt_version, scenario, output_json, admin_alert, latency_ms, success, error, created_at")
      .gte("created_at", windowStart.toISOString())
      .lte("created_at", windowEnd.toISOString());

    if (error) throw error;
    const runs = rows || [];
    console.log(`[prompt-insights] Fetched ${runs.length} rows.`);

    if (runs.length === 0) {
      console.warn("[prompt-insights] No llm_runs in window. Exiting.");
      process.exit(0);
    }

    // Aggregate
    const scenarios = {};
    const promptVersionSet = new Set();
    const latencies = [];
    const confidences = [];
    const warningCodeMap = new Map();
    const assumptionMap = new Map();
    const improveWithMap = new Map();
    const profileSignalMap = new Map();
    const adminAlerts = [];
    const hardErrors = new Map();
    let successCount = 0;

    for (const row of runs) {
      promptVersionSet.add(row.prompt_version || "unknown");
      scenarios[row.scenario] = (scenarios[row.scenario] || 0) + 1;

      if (row.success) {
        successCount++;
      } else {
        const errKey = row.error || "unknown_error";
        incrementMap(hardErrors, errKey);
      }

      if (typeof row.latency_ms === "number") latencies.push(row.latency_ms);

      const out = row.output_json;
      if (out && typeof out === "object") {
        const conf = out.confidence;
        if (typeof conf === "number") confidences.push(conf);

        // Top-level warnings
        const warnings = Array.isArray(out.warnings) ? out.warnings : [];
        for (const w of warnings) {
          if (w?.code) incrementMap(warningCodeMap, w.code, w.message);
          if (w?.improveWith) incrementMap(improveWithMap, w.improveWith);
        }

        // Item-level warnings
        const items = Array.isArray(out.items) ? out.items : [];
        for (const item of items) {
          const iw = Array.isArray(item?.warnings) ? item.warnings : [];
          for (const w of iw) {
            if (w?.code) incrementMap(warningCodeMap, w.code, w.message);
            if (w?.improveWith) incrementMap(improveWithMap, w.improveWith);
          }
        }

        // Reasoning
        const r = out.reasoning;
        if (r && typeof r === "object") {
          for (const a of (Array.isArray(r.assumptions) ? r.assumptions : [])) {
            if (typeof a === "string" && a.trim()) incrementMap(assumptionMap, a.trim());
          }
          for (const s of (Array.isArray(r.profileSignalsUsed) ? r.profileSignalsUsed : [])) {
            if (typeof s === "string" && s.trim()) incrementMap(profileSignalMap, s.trim());
          }
        }
      }

      // Admin alerts (top-level column)
      if (row.admin_alert && typeof row.admin_alert === "object") {
        adminAlerts.push({
          severity: row.admin_alert.severity,
          code: row.admin_alert.code,
          message: row.admin_alert.message,
          createdAt: row.created_at,
        });
      }
    }

    const sortedLatencies = [...latencies].sort((a, b) => a - b);
    const sortedConfidences = [...confidences].sort((a, b) => a - b);

    const aggregate = {
      totalRuns: runs.length,
      successCount,
      failureCount: runs.length - successCount,
      scenarios,
      promptVersions: [...promptVersionSet],
      latency: {
        p50: percentile(sortedLatencies, 50),
        p95: percentile(sortedLatencies, 95),
        max: sortedLatencies[sortedLatencies.length - 1] ?? null,
      },
      confidence: confidences.length
        ? { mean: Math.round((confidences.reduce((a, b) => a + b, 0) / confidences.length) * 100) / 100, p10: percentile(sortedConfidences, 10) }
        : null,
      topWarningCodes: topN(warningCodeMap).map(({ text, count, samples }) => ({ code: text, count, sampleMessages: samples })),
      topAssumptions: topN(assumptionMap).map(({ text, count }) => ({ text, count })),
      topImproveWith: topN(improveWithMap).map(({ text, count }) => ({ text, count })),
      profileSignalDistribution: Object.fromEntries([...profileSignalMap.entries()].map(([k, v]) => [k, v.count])),
      adminAlerts,
      hardErrorSamples: [...hardErrors.entries()].map(([error, data]) => ({ error, count: data.count })),
    };

    console.log(`[prompt-insights] Aggregate ready. Calling Gemini for synthesis...`);

    const synthesisPrompt = `You are reviewing LLM run logs from a personal health logging app to help improve the system prompts.

Here is the aggregated data from the last ${INSIGHTS_DAYS} day(s):

${JSON.stringify(aggregate, null, 2)}

Write a concise markdown digest with these sections:

## Summary
2-3 sentences on overall health of the LLM pipeline.

## Warnings Losing Signal
List any warning codes that appear so frequently they may have become noise (threshold: >30% of runs). For each, say what it means and whether the baseline behavior should change.

## Underused Profile Fields
Based on profileSignalDistribution and topAssumptions, which profile fields exist but are rarely used? What does that suggest about the prompt?

## Concrete Prompt Edit Candidates
List 2-4 specific, actionable prompt changes supported by the data. Be precise — quote the pattern from topAssumptions or topImproveWith if relevant.

## Admin Attention
List all adminAlerts found. If none, say "None."

## Open Questions
1-3 things this digest cannot answer but a human reviewer should check.

Ground rules:
- Cite exact warning codes, assumption strings, and counts from the input above. Do not invent codes, counts, or patterns not present in the data.
- If a section has no real signal in the data, write a single sentence saying so (e.g. "No warning code crosses the 30% threshold."). Do not fabricate findings to fill the section.
- Keep the total digest under 600 words. Be direct, not generic.`;

    const result = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: synthesisPrompt,
    });

    const synthesis = result.text ?? "(no synthesis generated)";

    console.log(`[prompt-insights] Synthesis complete. Saving to prompt_insights...`);

    const { data: inserted, error: insertError } = await supabase
      .from("prompt_insights")
      .insert({
        window_start: windowStart.toISOString(),
        window_end: windowEnd.toISOString(),
        run_count: runs.length,
        prompt_versions: [...promptVersionSet],
        aggregate,
        synthesis,
        model: MODEL_NAME,
        triggered_by: TRIGGERED_BY,
      })
      .select("id")
      .single();

    if (insertError) throw insertError;

    console.log(`[prompt-insights] Done. Row id: ${inserted.id}`);
    console.log(`[prompt-insights] Runs analysed: ${runs.length} | Window: ${INSIGHTS_DAYS}d | Alerts: ${adminAlerts.length}`);
    process.exit(0);

  } catch (err) {
    console.error("[prompt-insights] Fatal error:", err);
    process.exit(1);
  }
}

run();
