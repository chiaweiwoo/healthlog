import { describe, expect, it } from "vitest";
import { extractJsonObject } from "@/lib/json";
import { normalizeProfileNoteResult, normalizeDailyResult } from "@/lib/llm-normalizers";
import { profileNoteParseResultSchema, dailyParseResultSchema } from "@/lib/schemas";

describe("extractJsonObject", () => {
  it("returns raw objects untouched", () => {
    expect(extractJsonObject('{"a":1}')).toBe('{"a":1}');
  });

  it("extracts fenced json", () => {
    expect(extractJsonObject("```json\n{\"a\":1}\n```")).toBe('{"a":1}');
  });

  it("extracts surrounding prose safely", () => {
    expect(extractJsonObject("Here:\n{\"a\":1}\nThanks")).toBe('{"a":1}');
  });
});

describe("normalizeDailyResult", () => {
  it("rescues near-miss gemini output into the expected schema", () => {
    const normalized = normalizeDailyResult({
      occurredTime: "2026-05-25T08:00:00Z",
      actionType: "eat",
      items: [
        {
          kind: "food",
          food: "Bedok Bak Chor Mee",
          remarks: "morning",
        },
      ],
      confidence: 0.9,
      warnings: [],
      remarks: "",
    });

    const parsed = dailyParseResultSchema.parse(normalized);
    expect(parsed.occurredTime).toBe("08:00");
    expect(parsed.actionType).toBe("create");
    expect(parsed.items[0]?.label).toBe("Bedok Bak Chor Mee");
    expect(parsed.items[0]?.confidence).toBe(0.9);
  });

  it("supports nutrients, macros, kcal, alcohol, and partial unknown nutrition", () => {
    const normalized = normalizeDailyResult({
      actionType: "record",
      items: [
        {
          type: "meal",
          name: "Bak chor mee",
          nutrients: {
            kcal: "520",
            protein_g: "24",
            fat: "18",
            carbohydrates: null,
            alcohol_g: "2",
          },
          confidence: 82,
          warnings: [{ warning: "Portion estimated" }],
          remarks: ["Morning", "Hawker bowl"],
        },
      ],
      confidence: 0.8,
      warnings: [],
      remarks: null,
    });

    const parsed = dailyParseResultSchema.parse(normalized);
    expect(parsed.actionType).toBe("create");
    expect(parsed.items[0]?.kind).toBe("food");
    expect(parsed.items[0]?.nutrition?.calories).toBe(520);
    expect(parsed.items[0]?.nutrition?.proteinG).toBe(24);
    expect(parsed.items[0]?.nutrition?.fatG).toBe(18);
    expect(parsed.items[0]?.nutrition?.carbsG).toBeNull();
    expect(parsed.items[0]?.nutrition?.alcoholG).toBe(2);
    expect(parsed.items[0]?.confidence).toBe(0.82);
    expect(parsed.items[0]?.remarks).toBe("Morning; Hawker bowl");
  });

  it("keeps beverage calories and water volume together", () => {
    const normalized = normalizeDailyResult({
      actionType: "record",
      items: [
        {
          kind: "food",
          label: "Barley tea",
          nutrition: {
            kcal: "5",
            carbs: "1",
          },
          waterMl: "500",
          confidence: 0.95,
        },
      ],
      confidence: 0.95,
      warnings: [],
      remarks: null,
    });

    const parsed = dailyParseResultSchema.parse(normalized);
    expect(parsed.items[0]?.kind).toBe("food");
    expect(parsed.items[0]?.waterMl).toBe(500);
    expect(parsed.items[0]?.nutrition?.calories).toBe(5);
    expect(parsed.items[0]?.nutrition?.carbsG).toBe(1);
  });

  it("normalizes invalid non-empty times before schema parsing", () => {
    const normalized = normalizeDailyResult({
      occurredTime: "25:99",
      items: [
        {
          kind: "food",
          label: "Tea",
          occurredTime: "77:10",
          confidence: 0.8,
          warnings: [],
          metadata: {},
        },
        {
          kind: "food",
          label: "Toast",
          occurredTime: "oops",
          confidence: 0.8,
          warnings: [],
          metadata: {},
        },
      ],
      confidence: 0.8,
      warnings: [],
      remarks: null,
    });

    const parsed = dailyParseResultSchema.parse(normalized);
    expect(parsed.occurredTime).toBe("23:59");
    expect(parsed.warnings.some((warning) => warning.code === "time_normalized")).toBe(true);
    expect(parsed.items[0]?.occurredTime).toBe("23:59");
    expect(parsed.items[0]?.warnings.some((warning) => warning.code === "time_normalized")).toBe(true);
    expect(parsed.items[1]?.occurredTime).toBe("23:59");
    expect(parsed.items[1]?.warnings.some((warning) => warning.code === "time_normalized")).toBe(true);
  });
});

describe("normalizeProfileNoteResult", () => {
  it("rescues confidence and remarks drift for body profile updates", () => {
    const normalized = normalizeProfileNoteResult({
      action: "update",
      profile: {
        sex: "male",
        age: 38,
        heightCm: 168,
        weightKg: 106,
      },
      overrides: {
        water_target_ml: "3200",
      },
      metadataUpserts: [
        {
          id: "work-style",
          category: "lifestyle",
          label: "Work style",
          value: "White-collar, mostly sitting.",
        },
      ],
      measurements: [],
      confidence: {
        profile: 0.9,
        measurements: 0.9,
      },
      warnings: [],
      remarks: [],
    });

    const parsed = profileNoteParseResultSchema.parse(normalized);
    expect(parsed.action).toBe("update");
    expect(parsed.profile?.sex).toBe("male");
    expect(parsed.profile?.age).toBe(38);
    expect(parsed.overrides?.waterTargetMl).toBe(3200);
    expect(parsed.metadataUpserts[0]?.label).toBe("Work style");
    expect(parsed.confidence).toBe(0.9);
    expect(parsed.remarks).toBeNull();
  });

  it("maps medication and injury context into medical memory", () => {
    const normalized = normalizeProfileNoteResult({
      action: "update",
      metadataUpserts: [
        {
          label: "Medication",
          value: "Taking metformin daily.",
        },
        {
          label: "Injury limitation",
          value: "Avoiding running due to ankle sprain.",
        },
      ],
      measurements: [],
      confidence: 0.8,
      warnings: [],
      remarks: null,
    });

    const parsed = profileNoteParseResultSchema.parse(normalized);
    expect(parsed.metadataUpserts[0]?.category).toBe("medical_context");
    expect(parsed.metadataUpserts[1]?.category).toBe("medical_context");
  });

  it("keeps age, height, and weight as scalar profile fields", () => {
    const normalized = normalizeProfileNoteResult({
      action: "update",
      profile: {
        age: "33",
        height: "172 cm",
        weight: "68.5 kg",
        sex: "female",
      },
      measurements: [],
      confidence: 0.85,
      warnings: [],
      remarks: null,
    });

    const parsed = profileNoteParseResultSchema.parse(normalized);
    expect(parsed.profile?.age).toBe(33);
    expect(parsed.profile?.heightCm).toBe(172);
    expect(parsed.profile?.weightKg).toBe(68.5);
    expect(parsed.measurements).toHaveLength(0);
  });

  it("treats an empty profile object as no scalar patch", () => {
    const normalized = normalizeProfileNoteResult({
      action: "update",
      profile: {},
      measurements: [],
      confidence: 0.8,
      warnings: [],
      remarks: null,
    });

    const parsed = profileNoteParseResultSchema.parse(normalized);
    expect(parsed.profile).toBeUndefined();
  });

  it("keeps partial profile patches sparse instead of filling nulls", () => {
    const normalized = normalizeProfileNoteResult({
      action: "update",
      profile: {
        age: "33",
      },
      measurements: [],
      confidence: 0.85,
      warnings: [],
      remarks: null,
    });

    const parsed = profileNoteParseResultSchema.parse(normalized);
    expect(parsed.profile).toEqual(
      expect.objectContaining({
        age: 33,
      }),
    );
    expect(parsed.profile).not.toHaveProperty("sex");
    expect(parsed.profile).not.toHaveProperty("heightCm");
    expect(parsed.profile).not.toHaveProperty("weightKg");
    expect(parsed.profile).not.toHaveProperty("activityLevel");
  });

  it("treats bmr-only updates as additive overrides without scalar clears", () => {
    const normalized = normalizeProfileNoteResult({
      action: "update",
      profile: {},
      overrides: {
        bmr: "1800",
      },
      measurements: [],
      confidence: 0.9,
      warnings: [],
      remarks: null,
    });

    const parsed = profileNoteParseResultSchema.parse(normalized);
    expect(parsed.profile).toBeUndefined();
    expect(parsed.overrides?.bmr).toBe(1800);
    expect(parsed.metadataDeletes).toEqual([]);
    expect(parsed.overrideDeletes).toEqual([]);
  });

  it("does not turn unrelated notes into profile memory when no structured fields are present", () => {
    const normalized = normalizeProfileNoteResult({
      action: "clarify",
      metadataUpserts: [],
      measurements: [],
      confidence: 0.35,
      warnings: [
        {
          code: "profile_context_not_relevant",
          message: "This note does not look relevant to health logging or analysis.",
        },
      ],
      remarks: null,
    });

    const parsed = profileNoteParseResultSchema.parse(normalized);
    expect(parsed.action).toBe("clarify");
    expect(parsed.metadataUpserts).toHaveLength(0);
    expect(parsed.metadataDeletes).toEqual([]);
    expect(parsed.overrideDeletes).toEqual([]);
    expect(parsed.warnings[0]?.code).toBe("profile_context_not_relevant");
  });

  it("generates deterministic fallback memory ids from category and label", () => {
    const normalized = normalizeProfileNoteResult({
      action: "update",
      metadataUpserts: [
        {
          category: "medical_context",
          label: "Medication",
          value: "Taking metformin daily.",
        },
      ],
      measurements: [],
      confidence: 0.8,
      warnings: [],
      remarks: null,
    });

    const parsed = profileNoteParseResultSchema.parse(normalized);
    expect(parsed.metadataUpserts[0]?.id).toBe("memory-medical-context-medication");
  });
});
