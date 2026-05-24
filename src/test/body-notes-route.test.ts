import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRequireApiSession = vi.fn();
const mockCreatePendingBodyNote = vi.fn();
const mockFinalizeBodyNoteFailed = vi.fn();
const mockFinalizeBodyNoteParsed = vi.fn();
const mockGetProfile = vi.fn();
const mockListBodyMeasurements = vi.fn();
const mockListBodyNotes = vi.fn();
const mockParseBodyNote = vi.fn();
const mockLogUserAction = vi.fn();

vi.mock("@/lib/auth", () => ({
  requireApiSession: mockRequireApiSession,
}));

vi.mock("@/lib/db", () => ({
  createPendingBodyNote: mockCreatePendingBodyNote,
  finalizeBodyNoteFailed: mockFinalizeBodyNoteFailed,
  finalizeBodyNoteParsed: mockFinalizeBodyNoteParsed,
  getProfile: mockGetProfile,
  listBodyMeasurements: mockListBodyMeasurements,
  listBodyNotes: mockListBodyNotes,
}));

vi.mock("@/lib/llm", () => ({
  parseBodyNote: mockParseBodyNote,
}));

vi.mock("@/lib/action-logs", () => ({
  getErrorMessage: (error: unknown) => (error instanceof Error ? error.message : "Unexpected error."),
  logUserAction: mockLogUserAction,
}));

describe("/api/body-notes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireApiSession.mockResolvedValue({ ok: true, session: { username: "chiawei" } });
    mockLogUserAction.mockResolvedValue(undefined);
  });

  it("stores the raw body note before applying parsed updates", async () => {
    const { POST } = await import("@/app/api/body-notes/route");
    mockCreatePendingBodyNote.mockResolvedValue({ id: "body-1", parse_status: "pending" });
    mockGetProfile.mockResolvedValue(null);
    mockListBodyMeasurements.mockResolvedValue([]);
    mockParseBodyNote.mockResolvedValue({
      profile: { sex: "male", age: 38, heightCm: 168, weightKg: 106 },
      measurements: [],
      confidence: 0.95,
      warnings: [],
      remarks: null,
    });
    mockFinalizeBodyNoteParsed.mockResolvedValue({
      note: { id: "body-1", parse_status: "parsed" },
      profile: { sex: "male", age: 38, heightCm: 168, weightKg: 106 },
      measurements: [],
      changeSummary: { profileChanges: [{ field: "weightKg", before: null, after: 106 }], addedMeasurements: [] },
    });
    mockListBodyNotes.mockResolvedValue([{ id: "body-1", raw_note: "Male 38 168cm 106kg", parse_status: "parsed", warnings: [], parse_error: null, created_at: "2026-05-25T00:00:00.000Z" }]);

    const response = await POST(
      new NextRequest("http://localhost/api/body-notes", {
        method: "POST",
        body: JSON.stringify({ rawNote: "Male 38 168cm 106kg" }),
        headers: { "Content-Type": "application/json" },
      }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.bodyNote.parse_status).toBe("parsed");
    expect(mockCreatePendingBodyNote.mock.invocationCallOrder[0]).toBeLessThan(mockFinalizeBodyNoteParsed.mock.invocationCallOrder[0]);
  });

  it("keeps the raw body note visible when parsing fails", async () => {
    const { POST } = await import("@/app/api/body-notes/route");
    mockCreatePendingBodyNote.mockResolvedValue({ id: "body-2", parse_status: "pending" });
    mockGetProfile.mockResolvedValue(null);
    mockListBodyMeasurements.mockResolvedValue([]);
    mockParseBodyNote.mockRejectedValue(new Error("Bad structured output"));
    mockFinalizeBodyNoteFailed.mockResolvedValue({
      note: { id: "body-2", parse_status: "failed" },
      profile: null,
      measurements: [],
      changeSummary: { profileChanges: [], addedMeasurements: [] },
    });
    mockListBodyNotes.mockResolvedValue([{ id: "body-2", raw_note: "waist maybe 34?", parse_status: "failed", warnings: [], parse_error: "Bad structured output", created_at: "2026-05-25T00:00:00.000Z" }]);

    const response = await POST(
      new NextRequest("http://localhost/api/body-notes", {
        method: "POST",
        body: JSON.stringify({ rawNote: "waist maybe 34?" }),
        headers: { "Content-Type": "application/json" },
      }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.bodyNote.parse_status).toBe("failed");
    expect(mockFinalizeBodyNoteFailed).toHaveBeenCalled();
  });
});
