import { describe, expect, it } from "vitest";
import { buildProfileMetadata, deriveBmr, deriveNeat, deriveWaterTarget, getProfileMemory, getProfileOverrides } from "@/lib/profile-memory";

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
});
