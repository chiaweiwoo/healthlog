import { describe, expect, it } from "vitest";
import { extractJsonObject } from "@/lib/json";

describe("extractJsonObject", () => {
  it("returns raw objects untouched", () => {
    expect(extractJsonObject('{"a":1}')).toBe('{"a":1}');
  });

  it("extracts fenced json", () => {
    expect(extractJsonObject("```json\n{\"a\":1}\n```")).toBe('{"a":1}');
  });

  it("extracts surrounding prose safely", () => {
    expect(extractJsonObject("Here:\n{\"a\":1}\nThanks")).toBe('{"a":1}');
  });
});
