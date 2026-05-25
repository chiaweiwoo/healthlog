import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRequireApiSession = vi.fn();
const mockListDailyEntryDates = vi.fn();
const mockLogUserAction = vi.fn();

vi.mock("@/lib/auth", () => ({
  requireApiSession: mockRequireApiSession,
}));

vi.mock("@/lib/db", () => ({
  listDailyEntryDates: mockListDailyEntryDates,
}));

vi.mock("@/lib/action-logs", () => ({
  getErrorMessage: (error: unknown) => (error instanceof Error ? error.message : "Unexpected error."),
  logUserAction: mockLogUserAction,
}));

describe("/api/daily-entry-dates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireApiSession.mockResolvedValue({ ok: true, session: { username: "chiawei" } });
    mockLogUserAction.mockResolvedValue(undefined);
  });

  it("returns active record dates in the requested range", async () => {
    const { GET } = await import("@/app/api/daily-entry-dates/route");
    mockListDailyEntryDates.mockResolvedValue(["2026-05-24", "2026-05-25"]);

    const response = await GET(new NextRequest("http://localhost/api/daily-entry-dates?from=2026-05-01&to=2026-05-31"));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.dates).toEqual(["2026-05-24", "2026-05-25"]);
    expect(mockListDailyEntryDates).toHaveBeenCalledWith("2026-05-01", "2026-05-31");
  });
});
