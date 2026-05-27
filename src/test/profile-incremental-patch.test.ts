import { beforeEach, describe, expect, it, vi } from "vitest";

const getSupabaseAdminMock = vi.fn();

vi.mock("server-only", () => ({}));

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: getSupabaseAdminMock,
}));

type ProfileRow = {
  id: string;
  age: number | null;
  sex: "female" | "male" | null;
  height_cm: number | null;
  weight_kg: number | null;
  activity_level: "sedentary" | "light" | "moderate" | "active" | "very_active" | null;
  goal: string | null;
  country: string;
  remarks: string | null;
  metadata: Record<string, unknown>;
  updated_at?: string;
};

function buildSupabaseStub(state: {
  profileRow: ProfileRow | null;
  bodyNoteRow: Record<string, unknown>;
  measurementRows?: Array<Record<string, unknown>>;
}) {
  const measurements = state.measurementRows ?? [];

  return {
    from(table: string) {
      if (table === "profile") {
        return {
          select: () => ({
            limit: () => ({
              maybeSingle: async () => ({
                data: state.profileRow,
                error: null,
              }),
            }),
          }),
          upsert: (payload: Record<string, unknown>) => ({
            select: () => ({
              single: async () => {
                state.profileRow = {
                  id: "current",
                  age: (payload.age as number | null | undefined) ?? null,
                  sex: (payload.sex as ProfileRow["sex"] | undefined) ?? null,
                  height_cm: (payload.height_cm as number | null | undefined) ?? null,
                  weight_kg: (payload.weight_kg as number | null | undefined) ?? null,
                  activity_level: (payload.activity_level as ProfileRow["activity_level"] | undefined) ?? null,
                  goal: (payload.goal as string | null | undefined) ?? null,
                  country: (payload.country as string | undefined) ?? "Singapore",
                  remarks: (payload.remarks as string | null | undefined) ?? null,
                  metadata: (payload.metadata as Record<string, unknown> | undefined) ?? {},
                  updated_at: payload.updated_at as string | undefined,
                };
                return {
                  data: state.profileRow,
                  error: null,
                };
              },
            }),
          }),
        };
      }

      if (table === "body_measurements") {
        return {
          insert: (rows: Array<Record<string, unknown>>) => ({
            select: async () => {
              const inserted = rows.map((row, index) => ({
                id: `measurement-${measurements.length + index + 1}`,
                measured_at: row.measured_at ?? new Date().toISOString(),
                type: row.type,
                value: row.value,
                unit: row.unit,
                confidence: row.confidence,
                remarks: row.remarks ?? null,
                metadata: row.metadata ?? {},
              }));
              measurements.push(...inserted);
              return {
                data: inserted,
                error: null,
              };
            },
          }),
          select: () => ({
            order: () => ({
              limit: async () => ({
                data: measurements,
                error: null,
              }),
            }),
          }),
        };
      }

      if (table === "body_notes") {
        return {
          update: (payload: Record<string, unknown>) => ({
            eq: () => ({
              select: () => ({
                single: async () => {
                  state.bodyNoteRow = {
                    ...state.bodyNoteRow,
                    ...payload,
                  };
                  return {
                    data: state.bodyNoteRow,
                    error: null,
                  };
                },
              }),
            }),
          }),
        };
      }

      throw new Error(`Unexpected table ${table}`);
    },
  };
}

describe("finalizeBodyNoteParsed incremental profile patches", () => {
  beforeEach(() => {
    vi.resetModules();
    getSupabaseAdminMock.mockReset();
  });

  it("preserves existing essentials and memory for a bmr-only update", async () => {
    getSupabaseAdminMock.mockReturnValue(
      buildSupabaseStub({
        profileRow: {
          id: "current",
          age: 38,
          sex: "male",
          height_cm: 168,
          weight_kg: 106,
          activity_level: "light",
          goal: "Lose weight",
          country: "Singapore",
          remarks: "Existing remarks",
          metadata: {
            overrides: {
              waterTargetMl: 3200,
              neatCalories: 220,
            },
            memory: [
              {
                id: "memory-medical_context-medication",
                category: "medical_context",
                label: "Medication",
                value: "Taking metformin daily.",
                updatedAt: "2026-05-25T00:00:00.000Z",
              },
            ],
          },
        },
        bodyNoteRow: {
          id: "body-1",
          parse_status: "pending",
        },
      }),
    );

    const { finalizeBodyNoteParsed } = await import("@/lib/db");
    const result = await finalizeBodyNoteParsed("body-1", "Set my BMR to 1800", {
      action: "update",
      profile: {},
      metadataUpserts: [],
      metadataDeletes: ["memory-medical_context-medication"],
      overrides: {
        bmr: 1800,
      },
      overrideDeletes: ["neatCalories"],
      measurements: [],
      confidence: 0.9,
      warnings: [],
      remarks: null,
      reasoning: { assumptions: [], profileSignalsUsed: [], unresolvedAmbiguities: [] },
      adminAlert: null,
    });

    expect(result.profile).toEqual(
      expect.objectContaining({
        age: 38,
        sex: "male",
        heightCm: 168,
        weightKg: 106,
        activityLevel: "light",
        goal: "Lose weight",
        remarks: "Existing remarks",
      }),
    );
    expect(result.profile?.metadata).toEqual(
      expect.objectContaining({
        overrides: {
          waterTargetMl: 3200,
          neatCalories: 220,
          bmr: 1800,
        },
        memory: [
          expect.objectContaining({
            id: "memory-medical_context-medication",
            value: "Taking metformin daily.",
          }),
        ],
      }),
    );
  });

  it("keeps existing profile state untouched for unrelated clarify notes", async () => {
    getSupabaseAdminMock.mockReturnValue(
      buildSupabaseStub({
        profileRow: {
          id: "current",
          age: 33,
          sex: "female",
          height_cm: 172,
          weight_kg: 68,
          activity_level: "moderate",
          goal: "Improve fitness",
          country: "Singapore",
          remarks: null,
          metadata: {
            memory: [
              {
                id: "memory-lifestyle-work-style",
                category: "lifestyle",
                label: "Work style",
                value: "Mostly desk work.",
                updatedAt: "2026-05-25T00:00:00.000Z",
              },
            ],
          },
        },
        bodyNoteRow: {
          id: "body-2",
          parse_status: "pending",
        },
      }),
    );

    const { finalizeBodyNoteParsed } = await import("@/lib/db");
    const result = await finalizeBodyNoteParsed("body-2", "I like Diablo 4", {
      action: "clarify",
      profile: {},
      metadataUpserts: [],
      metadataDeletes: ["memory-lifestyle-work-style"],
      overrides: {},
      overrideDeletes: ["bmr"],
      measurements: [],
      confidence: 0.35,
      warnings: [
        {
          code: "profile_context_not_relevant",
          message: "This note does not look relevant to health logging or analysis.",
        },
      ],
      remarks: null,
      reasoning: { assumptions: [], profileSignalsUsed: [], unresolvedAmbiguities: [] },
      adminAlert: null,
    });

    expect(result.profile).toEqual(
      expect.objectContaining({
        age: 33,
        weightKg: 68,
        activityLevel: "moderate",
      }),
    );
    expect(result.profile?.metadata).toEqual(
      expect.objectContaining({
        memory: [
          expect.objectContaining({
            id: "memory-lifestyle-work-style",
            value: "Mostly desk work.",
          }),
        ],
      }),
    );
  });
});
