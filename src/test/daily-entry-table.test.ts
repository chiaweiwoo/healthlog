import { describe, expect, it } from "vitest";
import { flattenEntriesForTable, formatEntryTableMetricValue, sumEntryTableMetric } from "@/lib/daily-entry-table";

describe("daily-entry-table helpers", () => {
  it("flattens parsed items and prefers item time, then entry time, then created time", () => {
    const rows = flattenEntriesForTable([
      {
        id: "entry-1",
        occurred_time: "09:40",
        parse_status: "parsed",
        is_active: true,
        created_at: "2026-05-25T03:10:00.000Z",
        parsed_items: [
          {
            kind: "food",
            label: "Eggs",
            occurredTime: "08:15",
            confidence: 1,
            warnings: [],
            metadata: {},
            nutrition: { calories: 140, proteinG: 12, fatG: 10, carbsG: 1, alcoholG: 0 },
          },
          {
            kind: "water",
            label: "Plain water",
            confidence: 1,
            warnings: [],
            metadata: {},
            waterMl: 500,
          },
        ],
      },
      {
        id: "entry-2",
        occurred_time: null,
        parse_status: "parsed",
        is_active: true,
        created_at: "2026-05-25T11:04:00",
        parsed_items: [
          {
            kind: "exercise",
            label: "Walk",
            confidence: 1,
            warnings: [],
            metadata: {},
            exerciseCalories: 180,
          },
        ],
      },
    ]);

    expect(rows).toHaveLength(3);
    expect(rows[0]?.time).toBe("08:15");
    expect(rows[1]?.time).toBe("09:40");
    expect(rows[2]?.time).toBe("11:04");
  });

  it("sums selected metrics and excludes unknown values", () => {
    const rows = flattenEntriesForTable([
      {
        id: "entry-1",
        occurred_time: "10:00",
        parse_status: "parsed",
        is_active: true,
        created_at: "2026-05-25T10:00:00.000Z",
        parsed_items: [
          {
            kind: "food",
            label: "Barley tea",
            confidence: 1,
            warnings: [],
            metadata: {},
            waterMl: 500,
            nutrition: { calories: 5, proteinG: 0, fatG: 0, carbsG: 1, alcoholG: 0 },
          },
          {
            kind: "food",
            label: "Unknown meal",
            confidence: 0.7,
            warnings: [],
            metadata: {},
            nutrition: { calories: null, proteinG: null, fatG: null, carbsG: null, alcoholG: null },
          },
        ],
      },
    ]);

    expect(sumEntryTableMetric(rows, "water")).toBe(500);
    expect(sumEntryTableMetric(rows, "calories")).toBe(4);
    expect(sumEntryTableMetric(rows, "carbs")).toBe(1);
    expect(rows[1]?.measurements.calories.value).toBeNull();
    expect(formatEntryTableMetricValue(rows[1]?.measurements.calories.value ?? null, "kcal")).toBe("");
  });

  it("omits inactive and unparsed entries", () => {
    const rows = flattenEntriesForTable([
      {
        id: "entry-1",
        occurred_time: "10:00",
        parse_status: "pending",
        is_active: true,
        created_at: "2026-05-25T10:00:00.000Z",
        parsed_items: [],
      },
      {
        id: "entry-2",
        occurred_time: "11:00",
        parse_status: "parsed",
        is_active: false,
        created_at: "2026-05-25T11:00:00.000Z",
        parsed_items: [
          {
            kind: "water",
            label: "Water",
            confidence: 1,
            warnings: [],
            metadata: {},
            waterMl: 300,
          },
        ],
      },
    ]);

    expect(rows).toHaveLength(0);
  });
});
