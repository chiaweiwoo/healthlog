import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRequireApiSession = vi.fn();
const mockGetDailySummary = vi.fn();
const mockRecalculateAllDailySummaries = vi.fn();
const mockRecalculateDailySummary = vi.fn();
const mockLogUserAction = vi.fn();

vi.mock("@/lib/auth", () => ({
  requireApiSession: mockRequireApiSession,
}));

vi.mock("@/lib/db", () => ({
  getDailySummary: mockGetDailySummary,
  recalculateAllDailySummaries: mockRecalculateAllDailySummaries,
  recalculateDailySummary: mockRecalculateDailySummary,
}));

vi.mock("@/lib/action-logs", () => ({
  getErrorMessage: (error: unknown) => (error instanceof Error ? error.message : "Unexpected error."),
  logUserAction: mockLogUserAction,
}));

describe("/api/daily-summaries/recalculate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireApiSession.mockResolvedValue({ ok: true, session: { username: "chiawei" } });
    mockLogUserAction.mockResolvedValue(undefined);
  });

  it("recalculates one date when given a specific day", async () => {
    const { POST } = await import("@/app/api/daily-summaries/recalculate/route");
    mockRecalculateDailySummary.mockResolvedValue({ entry_date: "2026-05-25" });
    mockGetDailySummary.mockResolvedValue({ entry_date: "2026-05-25", calories: 320 });

    const response = await POST(
      new NextRequest("http://localhost/api/daily-summaries/recalculate", {
        method: "POST",
        body: JSON.stringify({ date: "2026-05-25" }),
        headers: { "Content-Type": "application/json" },
      }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.summary.entry_date).toBe("2026-05-25");
    expect(mockRecalculateDailySummary).toHaveBeenCalledWith("2026-05-25");
  });

  it("recalculates all active dates when requested", async () => {
    const { POST } = await import("@/app/api/daily-summaries/recalculate/route");
    mockRecalculateAllDailySummaries.mockResolvedValue([{ entry_date: "2026-05-24" }, { entry_date: "2026-05-25" }]);

    const response = await POST(
      new NextRequest("http://localhost/api/daily-summaries/recalculate", {
        method: "POST",
        body: JSON.stringify({ all: true }),
        headers: { "Content-Type": "application/json" },
      }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.summaries).toHaveLength(2);
    expect(mockRecalculateAllDailySummaries).toHaveBeenCalled();
    expect(mockRecalculateDailySummary).not.toHaveBeenCalled();
  });
});
