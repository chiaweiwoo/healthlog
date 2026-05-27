import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRequireApiSession = vi.fn();
const mockCreatePendingProfileNote = vi.fn();
const mockFinalizeProfileNoteFailed = vi.fn();
const mockFinalizeProfileNoteParsed = vi.fn();
const mockGetProfile = vi.fn();
const mockListBodyMeasurements = vi.fn();
const mockListProfileNotes = vi.fn();
const mockParseProfileNote = vi.fn();
const mockLogUserAction = vi.fn();

vi.mock("@/lib/auth", () => ({
  requireApiSession: mockRequireApiSession,
}));

vi.mock("@/lib/db", () => ({
  createPendingProfileNote: mockCreatePendingProfileNote,
  finalizeProfileNoteFailed: mockFinalizeProfileNoteFailed,
  finalizeProfileNoteParsed: mockFinalizeProfileNoteParsed,
  getProfile: mockGetProfile,
  listBodyMeasurements: mockListBodyMeasurements,
  listProfileNotes: mockListProfileNotes,
}));

vi.mock("@/lib/llm", () => ({
  parseProfileNote: mockParseProfileNote,
}));

vi.mock("@/lib/action-logs", () => ({
  getErrorMessage: (error: unknown) => (error instanceof Error ? error.message : "Unexpected error."),
  logUserAction: mockLogUserAction,
}));

describe("/api/profile-notes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireApiSession.mockResolvedValue({ ok: true, session: { username: "chiawei" } });
    mockLogUserAction.mockResolvedValue(undefined);
  });

  it("stores the raw profile note before applying parsed updates", async () => {
    const { POST } = await import("@/app/api/profile-notes/route");
    mockCreatePendingProfileNote.mockResolvedValue({ id: "profile-1", parse_status: "pending" });
    mockGetProfile.mockResolvedValue(null);
    mockListBodyMeasurements.mockResolvedValue([]);
    mockParseProfileNote.mockResolvedValue({
      profile: { sex: "male", age: 38, heightCm: 168, weightKg: 106 },
      measurements: [],
      confidence: 0.95,
      warnings: [],
      remarks: null,
    });
    mockFinalizeProfileNoteParsed.mockResolvedValue({
      note: { id: "profile-1", parse_status: "parsed" },
      profile: { sex: "male", age: 38, heightCm: 168, weightKg: 106 },
      measurements: [],
      changeSummary: { profileChanges: [{ field: "weightKg", before: null, after: 106 }], addedMeasurements: [] },
    });
    mockListProfileNotes.mockResolvedValue([{ id: "profile-1", raw_note: "Male 38 168cm 106kg", parse_status: "parsed", warnings: [], parse_error: null, created_at: "2026-05-25T00:00:00.000Z" }]);

    const response = await POST(
      new NextRequest("http://localhost/api/profile-notes", {
        method: "POST",
        body: JSON.stringify({ rawNote: "Male 38 168cm 106kg" }),
        headers: { "Content-Type": "application/json" },
      }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.profileNote.parse_status).toBe("parsed");
    expect(mockCreatePendingProfileNote.mock.invocationCallOrder[0]).toBeLessThan(mockFinalizeProfileNoteParsed.mock.invocationCallOrder[0]);
  });

  it("keeps the raw profile note visible when parsing fails", async () => {
    const { POST } = await import("@/app/api/profile-notes/route");
    mockCreatePendingProfileNote.mockResolvedValue({ id: "profile-2", parse_status: "pending" });
    mockGetProfile.mockResolvedValue(null);
    mockListBodyMeasurements.mockResolvedValue([]);
    mockParseProfileNote.mockRejectedValue(new Error("Bad structured output"));
    mockFinalizeProfileNoteFailed.mockResolvedValue({
      note: { id: "profile-2", parse_status: "failed" },
      profile: null,
      measurements: [],
      changeSummary: { profileChanges: [], addedMeasurements: [] },
    });
    mockListProfileNotes.mockResolvedValue([{ id: "profile-2", raw_note: "waist maybe 34?", parse_status: "failed", warnings: [], parse_error: "Bad structured output", created_at: "2026-05-25T00:00:00.000Z" }]);

    const response = await POST(
      new NextRequest("http://localhost/api/profile-notes", {
        method: "POST",
        body: JSON.stringify({ rawNote: "waist maybe 34?" }),
        headers: { "Content-Type": "application/json" },
      }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.profileNote.parse_status).toBe("failed");
    expect(mockFinalizeProfileNoteFailed).toHaveBeenCalled();
  });
});
