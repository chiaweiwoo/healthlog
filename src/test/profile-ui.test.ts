import React from "react";
import { describe, expect, it, beforeEach, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DailyDashboard } from "@/components/app/daily-dashboard";
import { ProfileDashboard } from "@/components/app/profile-dashboard";
import { AnalysisDashboard } from "@/components/app/analysis-dashboard";

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

  it("renders analysis dashboard with the two trend charts", () => {
    const dailyHistory = [
      { date: "2026-05-14", isLogged: false, calories: 0, proteinG: 0, fatG: 0, carbsG: 0, alcoholG: 0, waterMl: 0, exerciseCalories: 0, bmr: 1500, baseTdee: 2200, tefCalories: 0, tdee: 2200, waterTarget: 3200 },
      { date: "2026-05-15", isLogged: false, calories: 0, proteinG: 0, fatG: 0, carbsG: 0, alcoholG: 0, waterMl: 0, exerciseCalories: 0, bmr: 1500, baseTdee: 2200, tefCalories: 0, tdee: 2200, waterTarget: 3200 },
      { date: "2026-05-16", isLogged: false, calories: 0, proteinG: 0, fatG: 0, carbsG: 0, alcoholG: 0, waterMl: 0, exerciseCalories: 0, bmr: 1500, baseTdee: 2200, tefCalories: 0, tdee: 2200, waterTarget: 3200 },
      { date: "2026-05-17", isLogged: false, calories: 0, proteinG: 0, fatG: 0, carbsG: 0, alcoholG: 0, waterMl: 0, exerciseCalories: 0, bmr: 1500, baseTdee: 2200, tefCalories: 0, tdee: 2200, waterTarget: 3200 },
      { date: "2026-05-18", isLogged: false, calories: 0, proteinG: 0, fatG: 0, carbsG: 0, alcoholG: 0, waterMl: 0, exerciseCalories: 0, bmr: 1500, baseTdee: 2200, tefCalories: 0, tdee: 2200, waterTarget: 3200 },
      { date: "2026-05-19", isLogged: false, calories: 0, proteinG: 0, fatG: 0, carbsG: 0, alcoholG: 0, waterMl: 0, exerciseCalories: 0, bmr: 1500, baseTdee: 2200, tefCalories: 0, tdee: 2200, waterTarget: 3200 },
      { date: "2026-05-20", isLogged: false, calories: 0, proteinG: 0, fatG: 0, carbsG: 0, alcoholG: 0, waterMl: 0, exerciseCalories: 0, bmr: 1500, baseTdee: 2200, tefCalories: 0, tdee: 2200, waterTarget: 3200 },
      { date: "2026-05-21", isLogged: false, calories: 0, proteinG: 0, fatG: 0, carbsG: 0, alcoholG: 0, waterMl: 0, exerciseCalories: 0, bmr: 1500, baseTdee: 2200, tefCalories: 0, tdee: 2200, waterTarget: 3200 },
      { date: "2026-05-22", isLogged: false, calories: 0, proteinG: 0, fatG: 0, carbsG: 0, alcoholG: 0, waterMl: 0, exerciseCalories: 0, bmr: 1500, baseTdee: 2200, tefCalories: 0, tdee: 2200, waterTarget: 3200 },
      { date: "2026-05-23", isLogged: false, calories: 0, proteinG: 0, fatG: 0, carbsG: 0, alcoholG: 0, waterMl: 0, exerciseCalories: 0, bmr: 1500, baseTdee: 2200, tefCalories: 0, tdee: 2200, waterTarget: 3200 },
      { date: "2026-05-24", isLogged: true, calories: 1800, proteinG: 120, fatG: 60, carbsG: 180, alcoholG: 0, waterMl: 2500, exerciseCalories: 300, bmr: 1500, baseTdee: 2200, tefCalories: 0, tdee: 2500, waterTarget: 3200 },
      { date: "2026-05-25", isLogged: true, calories: 2400, proteinG: 100, fatG: 80, carbsG: 250, alcoholG: 0, waterMl: 3000, exerciseCalories: 0, bmr: 1500, baseTdee: 2200, tefCalories: 0, tdee: 2200, waterTarget: 3200 },
      { date: "2026-05-26", isLogged: true, calories: 2000, proteinG: 130, fatG: 70, carbsG: 200, alcoholG: 0, waterMl: 2800, exerciseCalories: 200, bmr: 1500, baseTdee: 2200, tefCalories: 0, tdee: 2400, waterTarget: 3200 },
      { date: "2026-05-27", isLogged: true, calories: 2200, proteinG: 140, fatG: 75, carbsG: 210, alcoholG: 0, waterMl: 3200, exerciseCalories: 150, bmr: 1500, baseTdee: 2200, tefCalories: 0, tdee: 2350, waterTarget: 3200 },
    ];

    const html = renderToStaticMarkup(
      React.createElement(AnalysisDashboard, { dailyHistory }),
    );

    expect(html).toContain("Analysis");
    expect(html).toContain("Calorie Deficit / Surplus");
    expect(html).toContain("Macro Intake Breakdown");
    expect(html).toContain("How the 7-day trend works");
    expect(html).toContain("Choose a macro to view separately");
    expect(html).toContain("Show protein only");
    expect(html).toContain("14-Day Trend");
    expect(html).not.toContain("data-testid=\"analysis-row-calories\"");
    expect(html).not.toContain("Calorie Outcome");
  });
});
