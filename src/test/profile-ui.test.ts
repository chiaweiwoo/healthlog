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

  it("renders analysis categories as one compact divided list without the old coaching callout", () => {
    const html = renderToStaticMarkup(
      React.createElement(AnalysisDashboard, {
        stats: {
          periodStart: "2026-05-14",
          periodEnd: "2026-05-27",
          completeDays: 4,
          totalIntakeCalories: 14728,
          averageIntakeCalories: 3682,
          averageQuotaCalories: 2811,
          averageNetCalories: 871,
          totalProteinG: 632.8,
          averageProteinG: 158.2,
          totalFatG: 84,
          averageFatG: 21,
          totalCarbsG: 228,
          averageCarbsG: 57,
          totalAlcoholG: 0,
          averageAlcoholG: 0,
          energySplit: {
            totalCalories: 1050,
            entries: [
              { label: "protein", calories: 633, percentage: 60 },
              { label: "carbs", calories: 228, percentage: 22 },
              { label: "fat", calories: 189, percentage: 18 },
              { label: "alcohol", calories: 0, percentage: 0 },
            ],
          },
          averageWaterMl: 3570,
          averageExerciseCalories: 0,
          consistencyScore: 0.29,
        },
        report: null,
        dailyHistory: [
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
          { date: "2026-05-24", isLogged: true, calories: 0, proteinG: 0, fatG: 0, carbsG: 0, alcoholG: 0, waterMl: 0, exerciseCalories: 0, bmr: 1500, baseTdee: 2200, tefCalories: 0, tdee: 2200, waterTarget: 3200 },
          { date: "2026-05-25", isLogged: true, calories: 0, proteinG: 0, fatG: 0, carbsG: 0, alcoholG: 0, waterMl: 0, exerciseCalories: 0, bmr: 1500, baseTdee: 2200, tefCalories: 0, tdee: 2200, waterTarget: 3200 },
          { date: "2026-05-26", isLogged: true, calories: 0, proteinG: 0, fatG: 0, carbsG: 0, alcoholG: 0, waterMl: 0, exerciseCalories: 0, bmr: 1500, baseTdee: 2200, tefCalories: 0, tdee: 2200, waterTarget: 3200 },
          { date: "2026-05-27", isLogged: true, calories: 0, proteinG: 0, fatG: 0, carbsG: 0, alcoholG: 0, waterMl: 0, exerciseCalories: 0, bmr: 1500, baseTdee: 2200, tefCalories: 0, tdee: 2200, waterTarget: 3200 },
        ],
      }),
    );

    expect(html).toContain("data-testid=\"analysis-row-calories\"");
    expect(html).toContain("data-testid=\"analysis-row-protein\"");
    expect(html).toContain("data-testid=\"analysis-row-water\"");
    expect(html).toContain("data-testid=\"analysis-row-macros\"");
    expect(html).toContain("3570 ml/day");
    expect(html).toContain("3200 ml");
    expect(html).toContain("Energy split is 60% protein, 22% carbs, 18% fat.");
    expect(html).toContain("Average intake is above your current calorie quota.");
    expect(html).not.toContain("rounded-lg border border-indigo-100/60 bg-indigo-50/20");
    expect(html).not.toContain("Carb 24%  Fat 9%  Protein 67%");
  });

  it("includes alcohol in the energy split sentence when alcohol contributes calories", () => {
    const html = renderToStaticMarkup(
      React.createElement(AnalysisDashboard, {
        stats: {
          periodStart: "2026-05-14",
          periodEnd: "2026-05-27",
          completeDays: 4,
          totalIntakeCalories: 14728,
          averageIntakeCalories: 3682,
          averageQuotaCalories: 2811,
          averageNetCalories: 871,
          totalProteinG: 400,
          averageProteinG: 100,
          totalFatG: 200,
          averageFatG: 50,
          totalCarbsG: 800,
          averageCarbsG: 200,
          totalAlcoholG: 56,
          averageAlcoholG: 14,
          energySplit: {
            totalCalories: 1948,
            entries: [
              { label: "protein", calories: 400, percentage: 21 },
              { label: "carbs", calories: 800, percentage: 41 },
              { label: "fat", calories: 450, percentage: 23 },
              { label: "alcohol", calories: 98, percentage: 15 },
            ],
          },
          averageWaterMl: 2800,
          averageExerciseCalories: 0,
          consistencyScore: 0.29,
        },
        report: null,
        dailyHistory: [],
      }),
    );

    expect(html).toContain("Energy split is 21% protein, 41% carbs, 23% fat, 15% alcohol.");
  });
});
