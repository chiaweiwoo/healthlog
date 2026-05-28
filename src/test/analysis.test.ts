import { describe, expect, it, vi } from "vitest";
import {
  analysisStatsSchema,
  analysisEvidenceSchema,
  analysisReportPayloadSchema,
} from "@/lib/schemas";
import { normalizeAnalysisReportResult } from "@/lib/llm-normalizers";
import { buildAnalysisEnergySplit } from "@/lib/analysis";

vi.mock("server-only", () => ({}));

describe("7-Day Analysis Schemas", () => {
  it("validates a compliant stats schema", () => {
    const stats = {
      periodStart: "2026-05-20",
      periodEnd: "2026-05-26",
      completeDays: 5,
      totalIntakeCalories: 10000,
      averageIntakeCalories: 2000,
      averageQuotaCalories: 2200,
      averageNetCalories: -200,
      totalProteinG: 500,
      averageProteinG: 100,
      totalFatG: 300,
      averageFatG: 60,
      totalCarbsG: 1000,
      averageCarbsG: 200,
      totalAlcoholG: 0,
      averageAlcoholG: 0,
      energySplit: buildAnalysisEnergySplit({
        averageProteinG: 100,
        averageCarbsG: 200,
        averageFatG: 60,
        averageAlcoholG: 0,
      }),
      averageWaterMl: 2500,
      averageExerciseCalories: 300,
      consistencyScore: 0.71,
    };

    const parsed = analysisStatsSchema.parse(stats);
    expect(parsed.completeDays).toBe(5);
    expect(parsed.consistencyScore).toBe(0.71);
    expect(parsed.energySplit.entries.find((entry) => entry.label === "fat")?.percentage).toBe(31);
  });

  it("builds energy split from calorie contribution and includes alcohol when present", () => {
    const split = buildAnalysisEnergySplit({
      averageProteinG: 150,
      averageCarbsG: 200,
      averageFatG: 50,
      averageAlcoholG: 14,
    });

    expect(split.totalCalories).toBe(1948);
    expect(split.entries).toEqual([
      { label: "protein", calories: 600, percentage: 31 },
      { label: "carbs", calories: 800, percentage: 41 },
      { label: "fat", calories: 450, percentage: 23 },
      { label: "alcohol", calories: 98, percentage: 5 },
    ]);
  });

  it("validates a compliant evidence schema including logTimeline", () => {
    const item = {
      kind: "food" as const,
      label: "Grilled Chicken Breast",
      quantity: "150g",
      confidence: 0.9,
      nutrition: {
        calories: 250,
        proteinG: 45,
        fatG: 5,
        carbsG: 0,
        alcoholG: 0,
      },
      warnings: [],
      remarks: "High protein",
      metadata: {},
    };

    const timelineItem = {
      date: "2026-05-25",
      time: "08:30",
      rawNote: "breakfast: eggs and chicken breast",
      parsedInfo: "Food: chicken breast (150g) - 45g P, 5g F, 0g C, 250 kcal",
      confidence: 0.9,
      warnings: [],
    };

    const evidence = {
      topCalorieFoods: [item],
      alcoholContributors: [],
      waterContributors: [],
      exerciseContributors: [],
      highCalorieLowProteinCandidates: [],
      logTimeline: [timelineItem],
    };

    const parsed = analysisEvidenceSchema.parse(evidence);
    expect(parsed.topCalorieFoods).toHaveLength(1);
    expect(parsed.topCalorieFoods[0].label).toBe("Grilled Chicken Breast");
    expect(parsed.logTimeline).toHaveLength(1);
    expect(parsed.logTimeline?.[0].time).toBe("08:30");
  });

  it("validates a compliant full analysis report payload with deeper analyses", () => {
    const fullPayload = {
      stats: {
        periodStart: "2026-05-20",
        periodEnd: "2026-05-26",
        completeDays: 5,
        totalIntakeCalories: 10000,
        averageIntakeCalories: 2000,
        averageQuotaCalories: 2200,
        averageNetCalories: -200,
        totalProteinG: 500,
        averageProteinG: 100,
        totalFatG: 300,
        averageFatG: 60,
        totalCarbsG: 1000,
        averageCarbsG: 200,
        totalAlcoholG: 0,
        averageAlcoholG: 0,
        energySplit: buildAnalysisEnergySplit({
          averageProteinG: 100,
          averageCarbsG: 200,
          averageFatG: 60,
          averageAlcoholG: 0,
        }),
        averageWaterMl: 2500,
        averageExerciseCalories: 300,
        consistencyScore: 0.71,
      },
      evidence: {
        topCalorieFoods: [],
        alcoholContributors: [],
        waterContributors: [],
        exerciseContributors: [],
        highCalorieLowProteinCandidates: [],
        logTimeline: [],
      },
      summary: "Great tracking week.",
      rootCauses: ["Consistently high protein intake"],
      focusAreas: [
        { action: "Maintain protein target", rationale: "Supports muscle goals" }
      ],
      profileGaps: [],
      confidence: "high" as const,
      overallAnalysis: {
        status: "good" as const,
        message: "Consistency is excellent; align goals.",
        examples: [
          {
            date: "2026-05-25",
            time: "08:30",
            rawNote: "eggs",
            parsedInfo: "eggs - 140 kcal",
            reason: "High consistency breakfast",
          }
        ],
      },
    };

    const parsed = analysisReportPayloadSchema.parse(fullPayload);
    expect(parsed.confidence).toBe("high");
    expect(parsed.overallAnalysis?.status).toBe("good");
    expect(parsed.overallAnalysis?.examples).toHaveLength(1);
  });
});

describe("normalizeAnalysisReportResult Normalizer", () => {
  it("tolerates messy or incomplete LLM JSON output including deeper analyses", () => {
    const messyOutput = {
      summary: " A decent week of tracking. ",
      root_causes: [
        "Extra calories from snacking",
        "  Low water on Wednesday  "
      ],
      focus_areas: [
        { action: "Drink more water", rationale: "Below target most days" },
        { action: "", rationale: "Invalid blank action" }
      ],
      profile_gaps: [
        { parameter: "Weight", whyItMatters: "MSJ calculation accuracy", improveAdvice: "Add weight" }
      ],
      confidence: "MEDIUM",
      overallAnalysis: {
        status: "  WATCH  ",
        message: "   Logging is sparse. ",
        examples: [
          {
            date: "2026-05-25",
            time: "08:30",
            raw_note: "  skip breakfast  ",
            parsed_info: "note - 0 kcal",
            reason: "Missing macro values",
          }
        ],
      },
    };

    const normalized = normalizeAnalysisReportResult(messyOutput);

    expect(normalized.summary).toBe("A decent week of tracking.");
    expect(normalized.rootCauses).toEqual(["Extra calories from snacking", "Low water on Wednesday"]);
    expect(normalized.focusAreas).toHaveLength(1);
    expect(normalized.focusAreas[0].action).toBe("Drink more water");
    expect(normalized.profileGaps).toHaveLength(1);
    expect(normalized.profileGaps[0].parameter).toBe("Weight");
    expect(normalized.confidence).toBe("medium");
    expect(normalized.overallAnalysis.status).toBe("watch");
    expect(normalized.overallAnalysis.message).toBe("Logging is sparse.");
    expect(normalized.overallAnalysis.examples).toHaveLength(1);
    expect(normalized.overallAnalysis.examples[0].rawNote).toBe("skip breakfast");
  });

  it("defaults gracefully when missing fields entirely", () => {
    const emptyOutput = {};
    const normalized = normalizeAnalysisReportResult(emptyOutput);

    expect(normalized.summary).toBe("");
    expect(normalized.rootCauses).toEqual([]);
    expect(normalized.focusAreas).toEqual([]);
    expect(normalized.profileGaps).toEqual([]);
    expect(normalized.confidence).toBe("low");
    expect(normalized.overallAnalysis.status).toBe("watch");
    expect(normalized.overallAnalysis.message).toBe("Overall progression needs to be evaluated from more logs.");
    expect(normalized.overallAnalysis.examples).toEqual([]);
  });
});
