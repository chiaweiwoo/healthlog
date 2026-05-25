import { describe, expect, it } from "vitest";
import {
  atwaterFactors,
  calculateBmr,
  calculateTdee,
  calculateThermicEffectOfFood,
  deriveFoodNutrition,
  getOutputBreakdown,
  summarizeDailyItems,
} from "@/lib/calculations";

describe("calculateBmr", () => {
  it("returns null with warning when profile is incomplete", () => {
    const result = calculateBmr({
      country: "Singapore",
      metadata: {},
    });

    expect(result.bmr).toBeNull();
    expect(result.warnings[0]?.code).toBe("profile_incomplete");
  });

  it("calculates mifflin-st jeor bmr", () => {
    const result = calculateBmr({
      age: 31,
      sex: "male",
      heightCm: 172,
      weightKg: 78.4,
      country: "Singapore",
      metadata: {},
    });

    expect(result.bmr).toBe(1709);
  });
});

describe("calculateTdee", () => {
  it("adds tef and exercise on top of a conservative baseline lifestyle", () => {
    const result = calculateTdee(
      {
        age: 31,
        sex: "male",
        heightCm: 172,
        weightKg: 78.4,
        activityLevel: "light",
        country: "Singapore",
        metadata: {},
      },
      { exerciseCalories: 320, tefCalories: 55 },
    );

    expect(result.baseTdee).toBe(1880);
    expect(result.baselineActivityCalories).toBe(171);
    expect(result.tdee).toBe(2255);
  });
});

describe("calculateThermicEffectOfFood", () => {
  it("uses macro-specific thermic effect rates", () => {
    const tef = calculateThermicEffectOfFood({
      proteinG: 30,
      fatG: 10,
      carbsG: 20,
      alcoholG: 5,
    });

    expect(tef).toBe(44);
  });
});

describe("deriveFoodNutrition", () => {
  it("uses Atwater factors when breakdown grams are available", () => {
    const derived = deriveFoodNutrition({
      nutrition: {
        calories: 999,
        proteinG: 2,
        fatG: 0,
        carbsG: 12,
        alcoholG: 14,
      },
    });

    expect(derived.calories).toBe(
      2 * atwaterFactors.protein + 0 * atwaterFactors.fat + 12 * atwaterFactors.carbs + 14 * atwaterFactors.alcohol,
    );
    expect(derived.caloriesSource).toBe("atwater");
    expect(derived.caloriesIncomplete).toBe(false);
  });

  it("falls back to model calories when all components are missing", () => {
    const derived = deriveFoodNutrition({
      nutrition: {
        calories: 210,
        proteinG: null,
        fatG: null,
        carbsG: null,
        alcoholG: null,
      },
    });

    expect(derived.calories).toBe(210);
    expect(derived.caloriesSource).toBe("model");
    expect(derived.caloriesIncomplete).toBe(false);
    expect(derived.macrosIncomplete).toBe(true);
  });
});

describe("summarizeDailyItems", () => {
  it("aggregates Atwater calories, water, exercise, and alcohol", () => {
    const summary = summarizeDailyItems(
      [
        {
          kind: "food",
          label: "Chicken rice",
          confidence: 0.8,
          warnings: [],
          metadata: {},
          nutrition: {
            calories: 650,
            proteinG: 35,
            fatG: 20,
            carbsG: 78,
            alcoholG: 0,
          },
        },
        {
          kind: "food",
          label: "Barley tea",
          confidence: 1,
          warnings: [],
          metadata: {},
          waterMl: 500,
          nutrition: {
            calories: 5,
            proteinG: 0,
            fatG: 0,
            carbsG: 1,
            alcoholG: 0,
          },
          sourceCreatedAt: "2026-05-25T03:04:00.000Z",
        },
        {
          kind: "exercise",
          label: "Walk",
          confidence: 0.9,
          warnings: [],
          metadata: {},
          exerciseCalories: 250,
        },
      ],
      {
        age: 31,
        sex: "male",
        heightCm: 172,
        weightKg: 78.4,
        activityLevel: "light",
        country: "Singapore",
        metadata: {},
      },
    );

    expect(summary.calories).toBe(636);
    expect(summary.waterMl).toBe(500);
    expect(summary.exerciseCalories).toBe(250);
    expect(summary.alcoholG).toBe(0);
    expect(summary.tefCalories).toBe(66);
    expect(summary.baselineActivityCalories).toBe(171);
    expect(summary.estimatedDeficit).toBe(1560);
    expect(summary.breakdown.food).toHaveLength(2);
    expect(summary.breakdown.water).toHaveLength(1);
    expect(summary.breakdown.water[0]?.label).toBe("Barley tea");
  });

  it("keeps incomplete calorie estimates out of deficit math", () => {
    const summary = summarizeDailyItems(
      [
        {
          kind: "food",
          label: "Bak chor mee",
          confidence: 0.7,
          warnings: [],
          metadata: {},
          nutrition: {
            calories: null,
            proteinG: 20,
            fatG: 15,
            carbsG: null,
            alcoholG: null,
          },
        },
      ],
      {
        age: 31,
        sex: "male",
        heightCm: 172,
        weightKg: 78.4,
        activityLevel: "light",
        country: "Singapore",
        metadata: {},
      },
    );

    expect(summary.calories).toBe(215);
    expect(summary.estimatedDeficit).toBeNull();
    expect(summary.breakdown.meta.caloriesIncomplete).toBe(true);
    expect(summary.warnings.some((warning) => warning.code === "calories_incomplete")).toBe(true);
  });
});

describe("getOutputBreakdown", () => {
  it("splits output into bmr, conservative baseline activity, tef, exercise, and total tdee", () => {
    const output = getOutputBreakdown({
      bmr: 1709,
      baseTdee: 1880,
      exerciseCalories: 250,
      proteinG: 39,
      fatG: 28,
      carbsG: 79,
      alcoholG: 0,
    });

    expect(output.tefCalories).toBe(72);
    expect(output.baselineActivityCalories).toBe(171);
    expect(output.totalTdee).toBe(2202);
  });

  it("returns null output totals when profile is incomplete", () => {
    const output = getOutputBreakdown({
      bmr: null,
      baseTdee: null,
      exerciseCalories: 120,
      proteinG: 10,
      fatG: 5,
      carbsG: 20,
      alcoholG: 0,
    });

    expect(output.tefCalories).toBe(18);
    expect(output.baselineActivityCalories).toBeNull();
    expect(output.totalTdee).toBeNull();
  });
});
