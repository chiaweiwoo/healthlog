"use client";

import { useMemo } from "react";
import type { ReactNode } from "react";
import { Calendar, Flame, Dumbbell, Droplets, PieChart } from "lucide-react";
import { AnalysisStats, FocusArea, ProfileGap } from "@/lib/schemas";
import { cn } from "@/lib/utils";

type AIReportPayload = {
  summary?: string;
  rootCauses?: string[];
  focusAreas?: FocusArea[];
  profileGaps?: ProfileGap[];
  confidence?: "low" | "medium" | "high";
  waterAnalysis?: {
    isGood: boolean;
    assessment: string;
    insights: string;
    recommendation: string;
  };
  calorieAnalysis?: {
    outcome: "deficit" | "surplus" | "maintenance";
    assessment: string;
    alerts: string[];
    insights: string;
    recommendation: string;
  };
  proteinAnalysis?: {
    assessment: string;
    alerts: string[];
    insights: string;
    recommendation: string;
  };
  macroAnalysis?: {
    assessment: string;
    insights: string;
    recommendation: string;
  };
};

export type DailyHistoryItem = {
  date: string;
  isLogged: boolean;
  calories: number;
  proteinG: number;
  fatG: number;
  carbsG: number;
  alcoholG: number;
  waterMl: number;
  exerciseCalories: number;
  bmr: number;
  baseTdee: number;
  tefCalories: number;
  tdee: number;
  waterTarget: number;
};

type StatusTone = "good" | "watch" | "neutral";

type AnalysisRowItem = {
  key: string;
  title: string;
  icon: typeof Flame;
  iconClassName: string;
  status: string;
  tone: StatusTone;
  metric: string;
  note?: string;
  bar?: ReactNode;
};

function formatDate(dateStr: string) {
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
  } catch {
    return dateStr;
  }
}

function compactSentence(...parts: Array<string | null | undefined>) {
  return parts
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(" ");
}

function sanitizeNote(text: string | null | undefined) {
  if (!text) return null;
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  return normalized;
}

function toneClasses(tone: StatusTone) {
  switch (tone) {
    case "good":
      return "text-emerald-700";
    case "watch":
      return "text-amber-700";
    default:
      return "text-stone-600";
  }
}

function pillClasses(tone: StatusTone) {
  switch (tone) {
    case "good":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "watch":
      return "border-amber-200 bg-amber-50 text-amber-700";
    default:
      return "border-stone-200 bg-white text-stone-600";
  }
}

function AnalysisStatusRow({
  item,
}: {
  item: AnalysisRowItem;
}) {
  const Icon = item.icon;

  return (
    <section
      data-testid={`analysis-row-${item.key}`}
      className="space-y-2 py-3 first:pt-0 last:pb-0"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <Icon size={15} className={cn("mt-0.5 shrink-0", item.iconClassName)} />
            <h2 className="text-sm font-semibold text-stone-900">{item.title}</h2>
          </div>
          <p className="text-sm font-medium leading-snug text-stone-700">{item.metric}</p>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold leading-none",
            pillClasses(item.tone),
          )}
        >
          {item.status}
        </span>
      </div>
      {item.note ? (
        <p className={cn("pl-[23px] text-sm leading-snug", toneClasses(item.tone))}>{item.note}</p>
      ) : null}
      {item.bar ? <div className="pl-[23px]">{item.bar}</div> : null}
    </section>
  );
}

export function AnalysisDashboard({
  stats,
  report,
  dailyHistory = [],
}: {
  stats: AnalysisStats;
  report: AIReportPayload | null;
  dailyHistory?: DailyHistoryItem[];
}) {
  const totalDaysInPeriod = 14;

  const fallbackAI = useMemo(() => {
    if (!stats) return null;

    const isDeficit = stats.averageNetCalories !== null && stats.averageNetCalories <= 0;
    const calorieAssessment = isDeficit ? "Calorie Deficit" : "Calorie Surplus";
    const calorieInsights = isDeficit
      ? `Your averages show a consistent daily calorie deficit of ${Math.abs(stats.averageNetCalories || 0)} kcal, which is supportive of energy balance and fat-loss goals.`
      : `Your averages show a daily calorie surplus of ${stats.averageNetCalories || 0} kcal. Consider adjusting portion sizes or increasing daily physical activity if your goal is maintenance or fat-loss.`;
    const calorieRecommendation = isDeficit
      ? "Maintain your current daily energy intake and ensure steady dietary tracking."
      : "Focus on reducing calorie-dense items and tracking snacks precisely.";

    const targetProtein = 100;
    const isProteinGood = stats.averageProteinG >= targetProtein;
    const proteinAssessment = isProteinGood ? "Optimal" : "Low Protein";
    const proteinInsights = isProteinGood
      ? `Average protein intake is ${stats.averageProteinG}g, meeting or exceeding target levels for muscle preservation.`
      : `Average protein intake is ${stats.averageProteinG}g, which is below active target levels. Higher protein intake supports muscle synthesis and satiety.`;
    const proteinRecommendation = isProteinGood
      ? "Continue incorporating high-quality lean protein sources throughout your meals."
      : "Consider adding lean protein sources (e.g., egg whites, chicken breast, or tofu) to your main meals.";

    const isWaterGood = stats.averageWaterMl >= 2000;
    const waterAssessment = isWaterGood ? "Sufficient" : "Dehydrated";
    const waterInsights = isWaterGood
      ? `Average water intake of ${stats.averageWaterMl}ml is supportive of digestive and metabolic function.`
      : `Average water intake of ${stats.averageWaterMl}ml is under the standard 2000ml goal. Try tracking fluids more consistently.`;
    const waterRecommendation = isWaterGood
      ? "Maintain this hydration pattern by keeping a water bottle nearby."
      : "Try to drink a full glass of water upon waking and before each major meal.";

    const totalMacrosG =
      (stats.averageProteinG || 0) + (stats.averageFatG || 0) + (stats.averageCarbsG || 0) || 1;
    const proteinPct = Math.round(((stats.averageProteinG || 0) / totalMacrosG) * 100);
    const fatPct = Math.round(((stats.averageFatG || 0) / totalMacrosG) * 100);
    const carbsPct = Math.round(((stats.averageCarbsG || 0) / totalMacrosG) * 100);
    const macroAssessment = "Balanced";
    const macroInsights = `Your energy distribution averages ${proteinPct}% protein, ${fatPct}% fats, and ${carbsPct}% carbohydrates. This provides a baseline macro-nutrient profile.`;
    const macroRecommendation =
      "Consider adjusting fat and carb ratios depending on your active recovery and energy levels.";

    return {
      waterAnalysis: {
        isGood: isWaterGood,
        assessment: waterAssessment,
        insights: waterInsights,
        recommendation: waterRecommendation,
      },
      calorieAnalysis: {
        outcome: isDeficit ? ("deficit" as const) : ("surplus" as const),
        assessment: calorieAssessment,
        alerts: stats.averageIntakeCalories > 3000 ? ["High energy intake averages observed."] : [],
        insights: calorieInsights,
        recommendation: calorieRecommendation,
      },
      proteinAnalysis: {
        assessment: proteinAssessment,
        alerts: !isProteinGood ? ["Protein intake averages below baseline muscle support goals."] : [],
        insights: proteinInsights,
        recommendation: proteinRecommendation,
      },
      macroAnalysis: {
        assessment: macroAssessment,
        insights: macroInsights,
        recommendation: macroRecommendation,
      },
    };
  }, [stats]);

  const waterAnalysis = report?.waterAnalysis || fallbackAI?.waterAnalysis;
  const calorieAnalysis = report?.calorieAnalysis || fallbackAI?.calorieAnalysis;
  const proteinAnalysis = report?.proteinAnalysis || fallbackAI?.proteinAnalysis;
  const macroAnalysis = report?.macroAnalysis || fallbackAI?.macroAnalysis;

  const consistencyPills = useMemo(() => {
    const pills = Array.from({ length: totalDaysInPeriod }).map((_, idx) => {
      if (idx < dailyHistory.length) {
        return dailyHistory[idx].isLogged;
      }
      return idx < stats.completeDays;
    });
    return pills;
  }, [dailyHistory, stats.completeDays]);

  const macroMetrics = useMemo(() => {
    const totalMacrosG =
      (stats.averageProteinG || 0) + (stats.averageFatG || 0) + (stats.averageCarbsG || 0) || 1;
    const proteinPct = Math.round(((stats.averageProteinG || 0) / totalMacrosG) * 100);
    const fatPct = Math.round(((stats.averageFatG || 0) / totalMacrosG) * 100);
    const carbsPct = Math.round(((stats.averageCarbsG || 0) / totalMacrosG) * 100);
    return { proteinPct, fatPct, carbsPct };
  }, [stats]);

  const analysisRows = useMemo<AnalysisRowItem[]>(() => {
    const rows: AnalysisRowItem[] = [];

    if (calorieAnalysis) {
      const calorieStatus =
        calorieAnalysis.outcome === "maintenance"
          ? "Steady"
          : calorieAnalysis.outcome === "deficit"
            ? "Good"
            : "Watch";
      const calorieTone: StatusTone =
        calorieAnalysis.outcome === "surplus" ||
        (calorieAnalysis.alerts && calorieAnalysis.alerts.length > 0)
          ? "watch"
          : calorieAnalysis.outcome === "maintenance"
            ? "neutral"
            : "good";
      const calorieNet =
        stats.averageNetCalories === null
          ? "Net unavailable"
          : stats.averageNetCalories <= 0
            ? `${Math.abs(stats.averageNetCalories)} kcal deficit`
            : `${stats.averageNetCalories} kcal surplus`;
      const calorieMetric = compactSentence(
        `Intake ${stats.averageIntakeCalories} kcal.`,
        `Target ${stats.averageQuotaCalories ?? "N/A"} kcal.`,
        calorieNet,
      );
      const calorieNote = sanitizeNote(
        calorieTone === "watch"
          ? calorieAnalysis.alerts?.[0] || calorieAnalysis.recommendation || calorieAnalysis.insights
          : calorieAnalysis.recommendation || calorieAnalysis.insights,
      );

      rows.push({
        key: "calories",
        title: "Calorie outcome",
        icon: Flame,
        iconClassName: "text-orange-500",
        status: calorieStatus,
        tone: calorieTone,
        metric: calorieMetric,
        note: calorieNote ?? undefined,
      });
    }

    if (proteinAnalysis) {
      const isProteinGood = stats.averageProteinG >= 100;
      rows.push({
        key: "protein",
        title: "Protein intake",
        icon: Dumbbell,
        iconClassName: "text-stone-600",
        status: isProteinGood ? "Good" : "Low",
        tone: isProteinGood ? "good" : "watch",
        metric: `Average protein is ${stats.averageProteinG} g per day.`,
        note: sanitizeNote(
          isProteinGood ? proteinAnalysis.recommendation : proteinAnalysis.alerts?.[0] || proteinAnalysis.recommendation,
        ) ?? undefined,
      });
    }

    if (waterAnalysis) {
      const waterTarget = 2000;
      const completionRate = Math.round((stats.averageWaterMl / waterTarget) * 100);
      const waterTone: StatusTone =
        completionRate < 90 ? "watch" : completionRate > 140 ? "neutral" : "good";
      const waterStatus =
        completionRate < 90 ? "Low" : completionRate > 140 ? "High" : "Good";
      rows.push({
        key: "water",
        title: "Water intake",
        icon: Droplets,
        iconClassName: "text-sky-500",
        status: waterStatus,
        tone: waterTone,
        metric: `Average ${stats.averageWaterMl} ml against a ${waterTarget} ml target (${completionRate}%).`,
        note: sanitizeNote(
          waterTone === "good" ? waterAnalysis.recommendation : waterAnalysis.insights,
        ) ?? undefined,
      });
    }

    if (macroAnalysis) {
      const macroBalanced =
        macroAnalysis.assessment === "Balanced" || macroAnalysis.assessment === "Healthy";
      rows.push({
        key: "macros",
        title: "Nutrient ratios",
        icon: PieChart,
        iconClassName: "text-emerald-500",
        status: macroBalanced ? "Balanced" : "Watch",
        tone: macroBalanced ? "neutral" : "watch",
        metric: `Carbs ${macroMetrics.carbsPct}%, fat ${macroMetrics.fatPct}%, protein ${macroMetrics.proteinPct}%.`,
        note:
          sanitizeNote(
            macroBalanced ? macroAnalysis.insights : macroAnalysis.recommendation || macroAnalysis.insights,
          ) ?? undefined,
        bar: (
          <div className="space-y-1.5">
            <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-stone-200/80">
              <div className="h-full bg-amber-300" style={{ width: `${macroMetrics.carbsPct}%` }} />
              <div className="h-full bg-stone-400/80" style={{ width: `${macroMetrics.fatPct}%` }} />
              <div className="h-full bg-emerald-500" style={{ width: `${macroMetrics.proteinPct}%` }} />
            </div>
            <p className="text-[11px] font-medium text-stone-500">
              Carb {macroMetrics.carbsPct}%  Fat {macroMetrics.fatPct}%  Protein {macroMetrics.proteinPct}%
            </p>
          </div>
        ),
      });
    }

    return rows;
  }, [calorieAnalysis, macroAnalysis, macroMetrics, proteinAnalysis, stats, waterAnalysis]);

  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 py-4">
      <div className="flex items-center justify-between gap-4 rounded-xl border border-stone-200 bg-stone-50/60 px-4 py-3 shadow-sm">
        <div className="space-y-0.5">
          <span className="text-[9px] font-bold uppercase tracking-wider text-stone-400">
            14-day rolling review
          </span>
          <h1 className="flex items-center gap-1.5 text-sm font-bold leading-none text-stone-900">
            <Calendar size={14} className="shrink-0 text-stone-500" />
            {formatDate(stats.periodStart)} - {formatDate(stats.periodEnd)}
          </h1>
        </div>

        <div className="flex w-32 shrink-0 gap-0.5">
          {consistencyPills.map((isLogged, index) => (
            <div
              key={index}
              className={cn(
                "h-2 flex-1 rounded-full border border-stone-200/20 transition-colors duration-300",
                isLogged ? "bg-emerald-500" : "bg-stone-200",
              )}
            />
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-stone-200 bg-stone-50/60 px-4 py-3 shadow-sm">
        <div className="divide-y divide-stone-200/70">
          {analysisRows.map((item) => (
            <AnalysisStatusRow key={item.key} item={item} />
          ))}
        </div>
      </div>
    </div>
  );
}
