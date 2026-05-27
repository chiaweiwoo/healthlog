import { beforeEach, describe, expect, it, vi } from "vitest";

const summarizeDailyItemsMock = vi.fn();
const getSupabaseAdminMock = vi.fn();

vi.mock("server-only", () => ({}));

vi.mock("@/lib/calculations", () => ({
  summarizeDailyItems: summarizeDailyItemsMock,
}));

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: getSupabaseAdminMock,
}));

function buildSupabaseStub(input: {
  entries: Array<Record<string, unknown>>;
  profileRow: Record<string, unknown> | null;
  onUpsert: (payload: Record<string, unknown>) => void;
}) {
  return {
    from(table: string) {
      if (table === "daily_entries") {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                order: async () => ({
                  data: input.entries,
                  error: null,
                }),
              }),
            }),
          }),
        };
      }

      if (table === "profile") {
        return {
          select: () => ({
            limit: () => ({
              maybeSingle: async () => ({
                data: input.profileRow,
                error: null,
              }),
            }),
          }),
        };
      }

      if (table === "daily_summaries") {
        return {
          upsert: (payload: Record<string, unknown>) => {
            input.onUpsert(payload);
            return {
              select: () => ({
                single: async () => ({
                  data: payload,
                  error: null,
                }),
              }),
            };
          },
        };
      }

      throw new Error(`Unexpected table ${table}`);
    },
  };
}

describe("recalculateDailySummary profile snapshots", () => {
  beforeEach(() => {
    vi.resetModules();
    summarizeDailyItemsMock.mockReset();
    getSupabaseAdminMock.mockReset();
    summarizeDailyItemsMock.mockReturnValue({
      calories: 0,
      proteinG: 0,
      fatG: 0,
      carbsG: 0,
      alcoholG: 0,
      waterMl: 0,
      exerciseCalories: 0,
      bmr: null,
      baseTdee: null,
      tdee: null,
      estimatedDeficit: null,
      confidence: 1,
      warnings: [],
      breakdown: {},
    });
  });

  it("writes a null profile_snapshot when no profile exists", async () => {
    let upsertPayload: Record<string, unknown> | null = null;
    getSupabaseAdminMock.mockReturnValue(
      buildSupabaseStub({
        entries: [],
        profileRow: null,
        onUpsert: (payload) => {
          upsertPayload = payload;
        },
      }),
    );

    const { recalculateDailySummary } = await import("@/lib/db");
    await recalculateDailySummary("2026-05-27");

    expect(upsertPayload).not.toBeNull();
    expect(readProfileSnapshot(upsertPayload)).toBeNull();
  });

  it("writes a derived profile_snapshot when a profile exists", async () => {
    let upsertPayload: Record<string, unknown> | null = null;
    getSupabaseAdminMock.mockReturnValue(
      buildSupabaseStub({
        entries: [],
        profileRow: {
          age: 32,
          sex: "female",
          height_cm: 165,
          weight_kg: 58,
          activity_level: "light",
          goal: null,
          country: "Singapore",
          remarks: null,
          metadata: {},
        },
        onUpsert: (payload) => {
          upsertPayload = payload;
        },
      }),
    );

    const { recalculateDailySummary } = await import("@/lib/db");
    await recalculateDailySummary("2026-05-27");

    expect(upsertPayload).not.toBeNull();
    expect(readProfileSnapshot(upsertPayload)).toEqual(
      expect.objectContaining({
        age: 32,
        sex: "female",
        heightCm: 165,
        weightKg: 58,
        activityLevel: "light",
        bmr: expect.objectContaining({ status: "estimated" }),
        neat: expect.objectContaining({ status: "estimated" }),
        waterTarget: expect.objectContaining({ status: "estimated" }),
      }),
    );
  });
});

function readProfileSnapshot(payload: Record<string, unknown> | null) {
  if (!payload) throw new Error("Expected an upsert payload");
  return payload.profile_snapshot;
}
