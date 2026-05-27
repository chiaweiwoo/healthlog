import { describe, expect, it } from "vitest";
import {
  buildProfileMetadata,
  buildProfileSnapshot,
  deriveBmr,
  deriveNeat,
  deriveWaterTarget,
  getMissingProfileEssentials,
  getProfileMemory,
  getProfileOverrides,
  isProfileComplete,
} from "@/lib/profile-memory";

describe("profile-memory helpers", () => {
  it("prefers water target override, then weight, then sex fallback", () => {
    expect(
      deriveWaterTarget({
        weightKg: 80,
        sex: "male",
        country: "Singapore",
        metadata: { overrides: { waterTargetMl: 3200 } },
      }).value,
    ).toBe(3200);

    expect(
      deriveWaterTarget({
        weightKg: 80,
        sex: "male",
        country: "Singapore",
        metadata: {},
      }).value,
    ).toBe(2800);

    expect(
      deriveWaterTarget({
        sex: "female",
        country: "Singapore",
        metadata: {},
      }).value,
    ).toBe(2200);
  });

  it("marks bmr and neat missing when required inputs are absent", () => {
    expect(
      deriveBmr({
        weightKg: 80,
        country: "Singapore",
        metadata: {},
      }).status,
    ).toBe("missing");

    expect(
      deriveNeat({
        age: 38,
        sex: "male",
        heightCm: 168,
        weightKg: 105,
        country: "Singapore",
        metadata: {},
      }).status,
    ).toBe("missing");
  });

  it("builds memory and overrides with upserts and deletes", () => {
    const metadata = buildProfileMetadata({
      existing: {
        overrides: { waterTargetMl: 3000 },
        memory: [
          {
            id: "old-item",
            category: "lifestyle",
            label: "Work style",
            value: "Desk work",
            updatedAt: "2026-05-25T00:00:00.000Z",
          },
        ],
      },
      overrides: { neatCalories: 190 },
      overrideDeletes: ["waterTargetMl"],
      memoryUpserts: [
        {
          id: "new-item",
          category: "diet",
          label: "Diet preference",
          value: "Less fried food",
          updatedAt: "2026-05-25T01:00:00.000Z",
        },
      ],
      memoryDeletes: ["old-item"],
    });

    const profile = { country: "Singapore", metadata };
    expect(getProfileOverrides(profile).waterTargetMl).toBeUndefined();
    expect(getProfileOverrides(profile).neatCalories).toBe(190);
    expect(getProfileMemory(profile)).toHaveLength(1);
    expect(getProfileMemory(profile)[0]?.id).toBe("new-item");
  });

  it("updates an existing memory item when category and label match", () => {
    const metadata = buildProfileMetadata({
      existing: {
        memory: [
          {
            id: "medication-existing",
            category: "medical_context",
            label: "Medication",
            value: "Taking metformin daily.",
            updatedAt: "2026-05-25T00:00:00.000Z",
          },
        ],
      },
      memoryUpserts: [
        {
          id: "memory-medical_context-medication",
          category: "medical_context",
          label: "Medication",
          value: "Taking metformin twice daily.",
          updatedAt: "2026-05-26T00:00:00.000Z",
        },
      ],
    });

    const profile = { country: "Singapore", metadata };
    expect(getProfileMemory(profile)).toHaveLength(1);
    expect(getProfileMemory(profile)[0]).toEqual(
      expect.objectContaining({
        id: "medication-existing",
        value: "Taking metformin twice daily.",
      }),
    );
  });

  it("preserves existing memory when a new note has no relevant memory upserts", () => {
    const metadata = buildProfileMetadata({
      existing: {
        memory: [
          {
            id: "injury-1",
            category: "medical_context",
            label: "Injury limitation",
            value: "Avoiding running due to ankle sprain.",
            updatedAt: "2026-05-25T00:00:00.000Z",
          },
        ],
      },
      memoryUpserts: [],
      memoryDeletes: [],
    });

    const profile = { country: "Singapore", metadata };
    expect(getProfileMemory(profile)).toHaveLength(1);
    expect(getProfileMemory(profile)[0]?.id).toBe("injury-1");
  });

  it("appends new memory with a stable unique id when no matching item exists", () => {
    const metadata = buildProfileMetadata({
      existing: {
        memory: [],
      },
      memoryUpserts: [
        {
          id: "memory-medical_context-medication",
          category: "medical_context",
          label: "Medication",
          value: "Taking metformin daily.",
          sourceNoteId: "body-1",
          updatedAt: "2026-05-25T00:00:00.000Z",
        },
      ],
    });

    const profile = { country: "Singapore", metadata };
    expect(getProfileMemory(profile)).toHaveLength(1);
    expect(getProfileMemory(profile)[0]?.id).toBe("memory-medical_context-medication");
  });

  it("treats only the five essentials as required for completeness", () => {
    expect(isProfileComplete(null)).toBe(false);
    expect(getMissingProfileEssentials(null).map((item) => item.key)).toEqual([
      "age",
      "sex",
      "heightCm",
      "weightKg",
      "activityLevel",
    ]);

    expect(
      isProfileComplete({
        age: 32,
        sex: "female",
        heightCm: 162,
        weightKg: 58,
        activityLevel: "light",
        country: "Singapore",
        metadata: {},
      }),
    ).toBe(true);

    expect(
      isProfileComplete({
        age: 32,
        sex: "female",
        heightCm: 162,
        weightKg: 58,
        activityLevel: "light",
        goal: null,
        country: "Singapore",
        metadata: {},
      }),
    ).toBe(true);
  });

  it("builds a profile snapshot with derived values and normalized overrides", () => {
    const snapshot = buildProfileSnapshot({
      age: 32,
      sex: "male",
      heightCm: 175,
      weightKg: 72,
      activityLevel: "moderate",
      country: "Singapore",
      metadata: {
        overrides: {
          neatCalories: 220,
        },
      },
    });

    expect(snapshot).not.toBeNull();
    expect(snapshot?.age).toBe(32);
    expect(snapshot?.bmr.status).toBe("estimated");
    expect(snapshot?.neat.status).toBe("overridden");
    expect(snapshot?.overrides.waterTargetMl).toBeNull();
    expect(snapshot?.snapshotAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("returns null snapshot when profile is missing", () => {
    expect(buildProfileSnapshot(null)).toBeNull();
  });
});
