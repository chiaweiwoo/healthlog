import { describe, expect, it } from "vitest";
import {
  analysisStatsSchema,
  analysisEvidenceSchema,
  analysisReportPayloadSchema,
} from "@/lib/schemas";
import { normalizeAnalysisReportResult } from "@/lib/llm-normalizers";

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
      averageWaterMl: 2500,
      averageExerciseCalories: 300,
      consistencyScore: 0.71,
    };

    const parsed = analysisStatsSchema.parse(stats);
    expect(parsed.completeDays).toBe(5);
    expect(parsed.consistencyScore).toBe(0.71);
  });

  it("validates a compliant evidence schema", () => {
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

    const evidence = {
      topCalorieFoods: [item],
      alcoholContributors: [],
      waterContributors: [],
      exerciseContributors: [],
      highCalorieLowProteinCandidates: [],
    };

    const parsed = analysisEvidenceSchema.parse(evidence);
    expect(parsed.topCalorieFoods).toHaveLength(1);
    expect(parsed.topCalorieFoods[0].label).toBe("Grilled Chicken Breast");
  });

  it("validates a compliant full analysis report payload", () => {
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
      },
      summary: "Great tracking week.",
      rootCauses: ["Consistently high protein intake"],
      focusAreas: [
        { action: "Maintain protein target", rationale: "Supports muscle goals" }
      ],
      profileGaps: [],
      confidence: "high" as const,
    };

    const parsed = analysisReportPayloadSchema.parse(fullPayload);
    expect(parsed.confidence).toBe("high");
    expect(parsed.focusAreas[0].action).toBe("Maintain protein target");
  });
});

describe("normalizeAnalysisReportResult Normalizer", () => {
  it("tolerates messy or incomplete LLM JSON output", () => {
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
      confidence: "MEDIUM"
    };

    const normalized = normalizeAnalysisReportResult(messyOutput);

    expect(normalized.summary).toBe("A decent week of tracking.");
    expect(normalized.rootCauses).toEqual(["Extra calories from snacking", "Low water on Wednesday"]);
    expect(normalized.focusAreas).toHaveLength(1);
    expect(normalized.focusAreas[0].action).toBe("Drink more water");
    expect(normalized.profileGaps).toHaveLength(1);
    expect(normalized.profileGaps[0].parameter).toBe("Weight");
    expect(normalized.confidence).toBe("medium");
  });

  it("defaults gracefully when missing fields entirely", () => {
    const emptyOutput = {};
    const normalized = normalizeAnalysisReportResult(emptyOutput);

    expect(normalized.summary).toBe("");
    expect(normalized.rootCauses).toEqual([]);
    expect(normalized.focusAreas).toEqual([]);
    expect(normalized.profileGaps).toEqual([]);
    expect(normalized.confidence).toBe("low");
  });
});
