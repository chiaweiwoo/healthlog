import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRequireApiSession = vi.fn();
const mockCreatePendingDailyEntry = vi.fn();
const mockFinalizeDailyEntryFailed = vi.fn();
const mockFinalizeDailyEntryParsed = vi.fn();
const mockGetDailySummary = vi.fn();
const mockGetProfile = vi.fn();
const mockListDailyEntries = vi.fn();
const mockPatchDailyEntry = vi.fn();
const mockParseDailyNote = vi.fn();
const mockLogUserAction = vi.fn();

vi.mock("@/lib/auth", () => ({
  requireApiSession: mockRequireApiSession,
}));

vi.mock("@/lib/db", () => ({
  createPendingDailyEntry: mockCreatePendingDailyEntry,
  finalizeDailyEntryFailed: mockFinalizeDailyEntryFailed,
  finalizeDailyEntryParsed: mockFinalizeDailyEntryParsed,
  getDailySummary: mockGetDailySummary,
  getProfile: mockGetProfile,
  listDailyEntries: mockListDailyEntries,
  patchDailyEntry: mockPatchDailyEntry,
}));

vi.mock("@/lib/llm", () => ({
  parseDailyNote: mockParseDailyNote,
}));

vi.mock("@/lib/action-logs", () => ({
  getErrorMessage: (error: unknown) => (error instanceof Error ? error.message : "Unexpected error."),
  logUserAction: mockLogUserAction,
}));

describe("/api/daily-entries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireApiSession.mockResolvedValue({ ok: true, session: { username: "chiawei" } });
    mockLogUserAction.mockResolvedValue(undefined);
  });

  it("keeps a saved row when parsing fails", async () => {
    const { POST } = await import("@/app/api/daily-entries/route");
    mockCreatePendingDailyEntry.mockResolvedValue({ id: "entry-1", entry_date: "2026-05-25" });
    mockGetProfile.mockResolvedValue(null);
    mockListDailyEntries.mockResolvedValue([{ id: "older", is_active: true }]);
    mockParseDailyNote.mockRejectedValue(new Error("LLM timeout"));
    mockFinalizeDailyEntryFailed.mockResolvedValue({
      id: "entry-1",
      entry_date: "2026-05-25",
      parse_status: "failed",
      parsed_items: [],
      warnings: [{ code: "parse_failed", message: "Saved note, but the structure is incomplete." }],
    });
    mockGetDailySummary.mockResolvedValue({ entry_date: "2026-05-25" });

    const response = await POST(
      new NextRequest("http://localhost/api/daily-entries", {
        method: "POST",
        body: JSON.stringify({ date: "2026-05-25", clientToday: "2026-05-26", rawNote: "bak chor mee" }),
        headers: { "Content-Type": "application/json" },
      }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.entry.parse_status).toBe("failed");
    expect(mockCreatePendingDailyEntry.mock.invocationCallOrder[0]).toBeLessThan(mockFinalizeDailyEntryFailed.mock.invocationCallOrder[0]);
    expect(mockFinalizeDailyEntryFailed).toHaveBeenCalledWith("entry-1", expect.any(Error), {
      entryDate: "2026-05-25",
      clientToday: "2026-05-26",
    });
  });

  it("reparses an edited note through PATCH", async () => {
    const { PATCH } = await import("@/app/api/daily-entries/route");
    mockPatchDailyEntry.mockResolvedValue({
      id: "entry-2",
      entry_date: "2026-05-25",
      raw_note: "updated note",
      parse_status: "pending",
      is_active: true,
    });
    mockGetProfile.mockResolvedValue(null);
    mockListDailyEntries.mockResolvedValue([]);
    mockParseDailyNote.mockResolvedValue({
      occurredTime: "08:00",
      actionType: "create",
      items: [{ kind: "food", label: "Bak chor mee", confidence: 0.8, warnings: [], metadata: {} }],
      confidence: 0.8,
      warnings: [],
      remarks: null,
    });
    mockFinalizeDailyEntryParsed.mockResolvedValue({
      id: "entry-2",
      entry_date: "2026-05-25",
      parse_status: "parsed",
      parsed_items: [{ kind: "food", label: "Bak chor mee", confidence: 0.8, warnings: [], metadata: {} }],
      warnings: [],
    });
    mockGetDailySummary.mockResolvedValue({ entry_date: "2026-05-25" });

    const response = await PATCH(
      new NextRequest("http://localhost/api/daily-entries", {
        method: "PATCH",
        body: JSON.stringify({ id: "entry-2", rawNote: "updated note", clientToday: "2026-05-26" }),
        headers: { "Content-Type": "application/json" },
      }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.entry.parse_status).toBe("parsed");
    expect(mockFinalizeDailyEntryParsed).toHaveBeenCalledWith("entry-2", expect.any(Object), {
      entryDate: "2026-05-25",
      clientToday: "2026-05-26",
    });
  });

  it("soft deletes entries through DELETE", async () => {
    const { DELETE } = await import("@/app/api/daily-entries/route");
    mockPatchDailyEntry.mockResolvedValue({
      id: "entry-3",
      entry_date: "2026-05-25",
      is_active: false,
      parse_status: "parsed",
    });
    mockGetDailySummary.mockResolvedValue({ entry_date: "2026-05-25" });

    const response = await DELETE(new NextRequest("http://localhost/api/daily-entries?id=entry-3", { method: "DELETE" }));

    expect(response.status).toBe(200);
    expect(mockPatchDailyEntry).toHaveBeenCalledWith("entry-3", { isActive: false });
  });

  it("GET /api/daily-entries excludes inactive entries by default", async () => {
    const { GET } = await import("@/app/api/daily-entries/route");
    mockListDailyEntries.mockResolvedValue([
      { id: "entry-1", entry_date: "2026-05-25", is_active: true },
      { id: "entry-2", entry_date: "2026-05-25", is_active: false },
    ]);
    mockGetDailySummary.mockResolvedValue({ entry_date: "2026-05-25" });

    const response = await GET(new NextRequest("http://localhost/api/daily-entries?date=2026-05-25"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.entries).toHaveLength(1);
    expect(body.entries[0].id).toBe("entry-1");
  });

  it("GET /api/daily-entries?includeInactive=true includes inactive entries", async () => {
    const { GET } = await import("@/app/api/daily-entries/route");
    mockListDailyEntries.mockResolvedValue([
      { id: "entry-1", entry_date: "2026-05-25", is_active: true },
      { id: "entry-2", entry_date: "2026-05-25", is_active: false },
    ]);
    mockGetDailySummary.mockResolvedValue({ entry_date: "2026-05-25" });

    const response = await GET(new NextRequest("http://localhost/api/daily-entries?date=2026-05-25&includeInactive=true"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.entries).toHaveLength(2);
  });
});
