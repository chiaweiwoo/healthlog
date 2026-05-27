import { describe, expect, it } from "vitest";

describe("reset-profile-data helpers", () => {
  it("requires an explicit confirmation flag", async () => {
    const { hasConfirmationFlag } = await import("../../scripts/reset-profile-data.mjs");

    expect(hasConfirmationFlag([])).toBe(false);
    expect(hasConfirmationFlag(["--confirm-reset-profile-data"])).toBe(true);
  });

  it("builds a full backup payload for deleted tables", async () => {
    const { buildProfileResetBackup } = await import("../../scripts/reset-profile-data.mjs");

    const backup = buildProfileResetBackup({
      profile: { id: "current", age: 32 },
      bodyNotes: [{ id: "n1" }],
      bodyMeasurements: [{ id: "m1" }, { id: "m2" }],
      analysisReports: [{ id: "a1" }],
    });

    expect(backup.profile).toEqual({ id: "current", age: 32 });
    expect(backup.bodyNotes).toHaveLength(1);
    expect(backup.bodyMeasurements).toHaveLength(2);
    expect(backup.analysisReports).toHaveLength(1);
    expect(backup.counts).toEqual({
      bodyNotes: 1,
      bodyMeasurements: 2,
      analysisReports: 1,
    });
    expect(backup.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
