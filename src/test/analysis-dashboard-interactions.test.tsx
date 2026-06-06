// @vitest-environment jsdom

import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  AnalysisDashboard,
  type DailyHistoryItem,
} from "@/components/app/analysis-dashboard";

const history: DailyHistoryItem[] = [
  {
    date: "2026-06-05",
    isLogged: true,
    calories: 2000,
    proteinG: 120,
    fatG: 65,
    carbsG: 210,
    alcoholG: 0,
    waterMl: 2500,
    exerciseCalories: 200,
    bmr: 1500,
    baseTdee: 2100,
    tefCalories: 180,
    tdee: 2480,
    waterTarget: 3000,
  },
];

describe("analysis dashboard interactions", () => {
  it("isolates a macro when its legend button is clicked", () => {
    render(<AnalysisDashboard dailyHistory={history} />);

    const proteinButton = screen.getByRole("button", {
      name: "Protein",
    });

    expect(proteinButton.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(proteinButton);
    expect(proteinButton.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("Protein 120g")).toBeTruthy();

    fireEvent.click(proteinButton);
    expect(proteinButton.getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByText("Daily macro readings")).toBeTruthy();
  });
});
