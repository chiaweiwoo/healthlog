import { describe, expect, it } from "vitest";
import { fetchSchemaDebugSnapshot, runSchemaChecks } from "../../scripts/check-schema.mjs";

function buildSelectResult(errorMessage?: string, data: unknown[] = []) {
  return Promise.resolve(errorMessage ? { data: null, error: { message: errorMessage } } : { data, error: null });
}

function createSupabaseStub(config: {
  appRequestLogsError?: string;
  parseStatusError?: string;
  parseErrorError?: string;
  alcoholError?: string;
  profileSnapshotError?: string;
}) {
  return {
    from(table: string) {
      if (table === "app_request_logs") {
        return {
          select: () => ({
            limit: () => buildSelectResult(config.appRequestLogsError, []),
            eq: () => ({
              order: () => ({
                limit: () => buildSelectResult(config.appRequestLogsError, []),
              }),
            }),
          }),
        };
      }

      if (table === "daily_entries") {
        return {
          select: (columns: string) => ({
            limit: () =>
              columns === "parse_status"
                ? buildSelectResult(config.parseStatusError, [])
                : buildSelectResult(config.parseErrorError, []),
            not: () => ({
              order: () => ({
                limit: () => buildSelectResult(undefined, []),
              }),
            }),
          }),
        };
      }

      if (table === "daily_summaries") {
        return {
          select: (columns: string) => ({
            limit: () =>
              columns === "alcohol_g"
                ? buildSelectResult(config.alcoholError, [])
                : buildSelectResult(config.profileSnapshotError, []),
          }),
        };
      }

      throw new Error(`Unexpected table ${table}`);
    },
  };
}

describe("check-schema", () => {
  it("fails when profile_snapshot is missing", async () => {
    const report = await runSchemaChecks(
      createSupabaseStub({
        profileSnapshotError: "Could not find the 'profile_snapshot' column of 'daily_summaries' in the schema cache",
      }),
    );

    expect(report.ok).toBe(false);
    expect(report.checks.find((check) => check.label === "healthlog.daily_summaries.profile_snapshot")?.message).toMatch(
      /profile_snapshot/,
    );
  });

  it("fails when app_request_logs is missing", async () => {
    const report = await runSchemaChecks(
      createSupabaseStub({
        appRequestLogsError: "relation \"healthlog.app_request_logs\" does not exist",
      }),
    );

    expect(report.ok).toBe(false);
    expect(report.checks.find((check) => check.label === "healthlog.app_request_logs")?.message).toMatch(/does not exist/);
  });

  it("passes when all required objects exist", async () => {
    const report = await runSchemaChecks(createSupabaseStub({}));
    expect(report.ok).toBe(true);
    expect(report.checks.every((check) => check.ok)).toBe(true);
  });

  it("returns a small debug snapshot", async () => {
    const snapshot = await fetchSchemaDebugSnapshot(createSupabaseStub({}));
    expect(snapshot.recentFailedEntries).toEqual([]);
    expect(snapshot.recentFailedLogs).toEqual([]);
  });
});
