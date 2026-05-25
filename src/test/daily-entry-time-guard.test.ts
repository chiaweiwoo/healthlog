import { describe, expect, it } from "vitest";
import {
  BACKDATED_ENTRY_FALLBACK_TIME,
  normalizeDailyParseResultTimes,
  resolveFailedEntryOccurredTime,
} from "@/lib/daily-entry-time-guard";

describe("daily entry time guard", () => {
  it("uses 23:59 for backdated entries without an explicit time", () => {
    const normalized = normalizeDailyParseResultTimes(
      {
        occurredTime: undefined,
        actionType: "create",
        items: [{ kind: "food", label: "Barley tea", confidence: 0.9, warnings: [], metadata: {} }],
        confidence: 0.9,
        warnings: [],
        remarks: null,
      },
      { entryDate: "2026-05-25", clientToday: "2026-05-26" },
    );

    expect(normalized.occurredTime).toBe(BACKDATED_ENTRY_FALLBACK_TIME);
  });

  it("keeps valid explicit times on backdated entries", () => {
    const normalized = normalizeDailyParseResultTimes(
      {
        occurredTime: "08:00",
        actionType: "create",
        items: [{ kind: "food", label: "Bak chor mee", confidence: 0.9, warnings: [], metadata: {} }],
        confidence: 0.9,
        warnings: [],
        remarks: null,
      },
      { entryDate: "2026-05-25", clientToday: "2026-05-26" },
    );

    expect(normalized.occurredTime).toBe("08:00");
  });

  it("normalizes invalid times to 23:59 and adds warnings", () => {
    const normalized = normalizeDailyParseResultTimes(
      {
        occurredTime: "25:99",
        actionType: "create",
        items: [
          { kind: "food", label: "Tea", occurredTime: "77:10", confidence: 0.8, warnings: [], metadata: {} },
        ],
        confidence: 0.8,
        warnings: [],
        remarks: null,
      },
      { entryDate: "2026-05-26", clientToday: "2026-05-26" },
    );

    expect(normalized.occurredTime).toBe(BACKDATED_ENTRY_FALLBACK_TIME);
    expect(normalized.warnings.some((warning) => warning.code === "time_normalized")).toBe(true);
    expect(normalized.items[0]?.occurredTime).toBe(BACKDATED_ENTRY_FALLBACK_TIME);
    expect(normalized.items[0]?.warnings.some((warning) => warning.code === "time_normalized")).toBe(true);
  });

  it("does not force same-day entries without a time to 23:59", () => {
    const normalized = normalizeDailyParseResultTimes(
      {
        occurredTime: undefined,
        actionType: "create",
        items: [{ kind: "food", label: "Chicken rice", confidence: 0.9, warnings: [], metadata: {} }],
        confidence: 0.9,
        warnings: [],
        remarks: null,
      },
      { entryDate: "2026-05-26", clientToday: "2026-05-26" },
    );

    expect(normalized.occurredTime).toBeNull();
  });

  it("uses 23:59 for failed backdated entries", () => {
    expect(resolveFailedEntryOccurredTime({ entryDate: "2026-05-25", clientToday: "2026-05-26" })).toBe("23:59");
    expect(resolveFailedEntryOccurredTime({ entryDate: "2026-05-26", clientToday: "2026-05-26" })).toBeNull();
  });
});
