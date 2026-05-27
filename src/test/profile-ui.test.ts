import React from "react";
import { describe, expect, it, beforeEach, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DailyDashboard } from "@/components/app/daily-dashboard";
import { ProfileDashboard } from "@/components/app/profile-dashboard";

const getProfileMock = vi.fn();
const getSupabaseAdminMock = vi.fn();

vi.mock("@/lib/db", () => ({
  getProfile: getProfileMock,
}));

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: getSupabaseAdminMock,
}));

vi.mock("server-only", () => ({}));

describe("profile-driven setup UI", () => {
  beforeEach(() => {
    getProfileMock.mockReset();
    getSupabaseAdminMock.mockReset();
  });

  it("shows the daily setup overlay when profile essentials are missing", () => {
    const html = renderToStaticMarkup(
      React.createElement(DailyDashboard, {
        initialDate: "2026-05-27",
        initialEntries: [],
        initialSummary: null,
        profile: null,
        profileComplete: false,
      }),
    );

    expect(html).toContain("Let&#x27;s get you set up!");
    expect(html).toContain("Go to Profile");
  });

  it("does not show the daily setup overlay when profile essentials are present", () => {
    const html = renderToStaticMarkup(
      React.createElement(DailyDashboard, {
        initialDate: "2026-05-27",
        initialEntries: [],
        initialSummary: null,
        profile: {
          age: 35,
          sex: "male",
          heightCm: 175,
          weightKg: 72,
          activityLevel: "moderate",
          goal: null,
          country: "Singapore",
          remarks: null,
          metadata: {},
        },
        profileComplete: true,
      }),
    );

    expect(html).not.toContain("Let&#x27;s get you set up!");
  });

  it("renders the redesigned profile dashboard without the old audit trail section", () => {
    const html = renderToStaticMarkup(
      React.createElement(ProfileDashboard, {
        initialProfile: null,
        initialMeasurements: [],
      }),
    );

    expect(html).toContain("Profile for Daily");
    expect(html).toContain("Profile knowledge");
    expect(html).toContain("No health context added yet.");
    expect(html).not.toContain("Recent profile notes");
    expect(html).not.toContain("Latest body measurements");
    expect((html.match(/>Missing</g) ?? []).length).toBe(5);
    expect(html).not.toContain(">Missing</span>");
  });

  it("shows derived targets only when essentials are complete", () => {
    const html = renderToStaticMarkup(
      React.createElement(ProfileDashboard, {
        initialProfile: {
          age: 35,
          sex: "male",
          heightCm: 175,
          weightKg: 72,
          activityLevel: "moderate",
          goal: null,
          country: "Singapore",
          remarks: null,
          metadata: {},
        },
        initialMeasurements: [],
      }),
    );

    expect(html).toContain("Calculated targets");
    expect(html).toContain("Water target");
  });

  it("groups medication and injury context into health-relevant sections", () => {
    const html = renderToStaticMarkup(
      React.createElement(ProfileDashboard, {
        initialProfile: {
          goal: "Fat loss",
          country: "Singapore",
          remarks: null,
          metadata: {
            memory: [
              {
                id: "med-1",
                category: "medical_context",
                label: "Medication",
                value: "Taking metformin daily.",
                updatedAt: "2026-05-27T00:00:00.000Z",
              },
              {
                id: "injury-1",
                category: "medical_context",
                label: "Injury limitation",
                value: "Avoiding running due to ankle sprain.",
                updatedAt: "2026-05-27T00:00:00.000Z",
              },
            ],
          },
        },
        initialMeasurements: [],
      }),
    );

    expect(html).toContain("Medication / Supplement");
    expect(html).toContain("Injury / Limitation");
  });

  it("shows the analysis setup gate when the profile is incomplete", async () => {
    getProfileMock.mockResolvedValue(null);
    getSupabaseAdminMock.mockReturnValue({
      from: () => ({
        select: () => ({
          order: () => ({
            order: () => ({
              limit: () => ({
                maybeSingle: async () => ({ data: null, error: null }),
              }),
            }),
          }),
        }),
      }),
    });

    const { default: AnalysisPage } = await import("@/app/app/analysis/page");
    const page = await AnalysisPage();
    const html = renderToStaticMarkup(page);

    expect(html).toContain("Analysis needs your profile");
    expect(html).toContain("Go to Profile");
  });
});
