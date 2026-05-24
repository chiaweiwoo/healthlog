import { beforeEach, describe, expect, it, vi } from "vitest";

describe("llm_runs logging", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("writes a successful llm_runs row on valid parsing", async () => {
    const insertMock = vi.fn().mockResolvedValue({ error: null });
    const generateContentMock = vi.fn().mockResolvedValue({
      text: JSON.stringify({
        actionType: "create",
        items: [{ kind: "food", label: "Chicken rice", confidence: 0.8, warnings: [], metadata: {}, nutrition: { calories: 650, proteinG: 35, fatG: 20, carbsG: 78 } }],
        confidence: 0.8,
        warnings: [],
        remarks: null,
      }),
    });

    vi.doMock("@/lib/env", () => ({
      getEnv: () => ({}),
      requireEnv: () => "gemini-test-key",
    }));
    vi.doMock("server-only", () => ({}));
    vi.doMock("@/lib/supabase", () => ({
      getSupabaseAdmin: () => ({
        from: () => ({
          insert: insertMock,
        }),
      }),
    }));
    vi.doMock("@google/genai", () => ({
      GoogleGenAI: class {
        models = { generateContent: generateContentMock };
      },
    }));
    vi.doMock("langfuse", () => ({
      Langfuse: class {
        trace() {
          return { generation: vi.fn() };
        }
        flushAsync() {
          return Promise.resolve();
        }
      },
    }));

    const { parseDailyNote } = await import("@/lib/llm");
    await parseDailyNote({
      note: "chicken rice",
      date: "2026-05-25",
      profile: null,
      activeEntries: [],
    });

    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({ success: true, scenario: "daily_quick" }));
  });

  it("writes a failed llm_runs row when parsing breaks", async () => {
    const insertMock = vi.fn().mockResolvedValue({ error: null });
    const generateContentMock = vi.fn().mockResolvedValue({
      text: "not valid json",
    });

    vi.doMock("@/lib/env", () => ({
      getEnv: () => ({}),
      requireEnv: () => "gemini-test-key",
    }));
    vi.doMock("server-only", () => ({}));
    vi.doMock("@/lib/supabase", () => ({
      getSupabaseAdmin: () => ({
        from: () => ({
          insert: insertMock,
        }),
      }),
    }));
    vi.doMock("@google/genai", () => ({
      GoogleGenAI: class {
        models = { generateContent: generateContentMock };
      },
    }));
    vi.doMock("langfuse", () => ({
      Langfuse: class {
        trace() {
          return { generation: vi.fn() };
        }
        flushAsync() {
          return Promise.resolve();
        }
      },
    }));

    const { parseDailyNote } = await import("@/lib/llm");

    await expect(
      parseDailyNote({
        note: "oops",
        date: "2026-05-25",
        profile: null,
        activeEntries: [],
      }),
    ).rejects.toThrow();

    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({ success: false, scenario: "daily_quick" }));
  });
});
