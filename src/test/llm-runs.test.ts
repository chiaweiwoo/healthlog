import { beforeEach, describe, expect, it, vi } from "vitest";

const insertMock = vi.fn();
const generateContentMock = vi.fn();

vi.mock("@/lib/env", () => ({
  getEnv: () => ({}),
  requireEnv: () => "gemini-test-key",
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => ({
    from: () => ({
      insert: insertMock,
    }),
  }),
}));

vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = { generateContent: generateContentMock };
  },
}));

vi.mock("langfuse", () => ({
  Langfuse: class {
    trace() {
      return { generation: vi.fn() };
    }
    flushAsync() {
      return Promise.resolve();
    }
  },
}));

describe("llm_runs logging", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    insertMock.mockResolvedValue({ error: null });
  });

  it("writes a successful llm_runs row on valid parsing", async () => {
    generateContentMock.mockResolvedValue({
      text: JSON.stringify({
        actionType: "create",
        items: [{ kind: "food", label: "Chicken rice", confidence: 0.8, warnings: [], metadata: {}, nutrition: { calories: 650, proteinG: 35, fatG: 20, carbsG: 78 } }],
        confidence: 0.8,
        warnings: [],
        remarks: null,
      }),
    });

    const { parseDailyNote } = await import("@/lib/llm");
    await parseDailyNote({
      note: "chicken rice",
      date: "2026-05-25",
      profile: null,
    });

    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({ success: true, scenario: "daily_quick" }));
  });

  it("writes a failed llm_runs row when parsing breaks", async () => {
    generateContentMock.mockResolvedValue({
      text: "not valid json",
    });

    const { parseDailyNote } = await import("@/lib/llm");

    await expect(
      parseDailyNote({
        note: "oops",
        date: "2026-05-25",
        profile: null,
      }),
    ).rejects.toThrow();

    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({ success: false, scenario: "daily_quick" }));
  });
});
