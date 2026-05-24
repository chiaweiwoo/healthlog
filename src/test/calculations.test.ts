import { describe, expect, it } from "vitest";
import { calculateBmr, calculateTdee, summarizeDailyItems } from "@/lib/calculations";

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
  it("adds exercise calories on top of base tdee", () => {
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
      320,
    );

    expect(result.baseTdee).toBe(2350);
    expect(result.tdee).toBe(2670);
  });
});

describe("summarizeDailyItems", () => {
  it("aggregates nutrition, water, and exercise", () => {
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
          },
        },
        {
          kind: "water",
          label: "Water",
          confidence: 1,
          warnings: [],
          metadata: {},
          waterMl: 600,
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

    expect(summary.calories).toBe(650);
    expect(summary.waterMl).toBe(600);
    expect(summary.exerciseCalories).toBe(250);
    expect(summary.estimatedDeficit).toBe(1950);
    expect(summary.breakdown.food).toHaveLength(1);
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

    expect(summary.calories).toBe(0);
    expect(summary.estimatedDeficit).toBeNull();
    expect(summary.breakdown.meta.caloriesIncomplete).toBe(true);
    expect(summary.warnings.some((warning) => warning.code === "calories_incomplete")).toBe(true);
  });
});
