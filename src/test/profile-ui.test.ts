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
    expect(html).toContain("No context added yet.");
    expect(html).not.toContain("Recent profile notes");
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
