import { describe, expect, it } from "vitest";
import { extractJsonObject } from "@/lib/json";
import { normalizeBodyResult, normalizeDailyResult } from "@/lib/llm-normalizers";
import { bodyParseResultSchema, dailyParseResultSchema } from "@/lib/schemas";

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
});

describe("normalizeBodyResult", () => {
  it("rescues confidence and remarks drift for body profile updates", () => {
    const normalized = normalizeBodyResult({
      profile: {
        sex: "male",
        age: 38,
        heightCm: 168,
        weightKg: 106,
      },
      measurements: [],
      confidence: {
        profile: 0.9,
        measurements: 0.9,
      },
      warnings: [],
      remarks: [],
    });

    const parsed = bodyParseResultSchema.parse(normalized);
    expect(parsed.profile?.sex).toBe("male");
    expect(parsed.profile?.age).toBe(38);
    expect(parsed.confidence).toBe(0.9);
    expect(parsed.remarks).toBeNull();
  });
});
