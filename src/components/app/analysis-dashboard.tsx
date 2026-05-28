"use client";

import { useMemo } from "react";
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
    status?: "good" | "watch";
    message?: string;
    isGood?: boolean;
    assessment?: string;
    insights?: string;
    recommendation?: string;
  };
  calorieAnalysis?: {
    status?: "good" | "watch";
    message?: string;
    outcome?: "deficit" | "surplus" | "maintenance";
    assessment?: string;
    alerts?: string[];
    insights?: string;
    recommendation?: string;
  };
  proteinAnalysis?: {
    status?: "good" | "watch";
    message?: string;
    assessment?: string;
    alerts?: string[];
    insights?: string;
    recommendation?: string;
  };
  macroAnalysis?: {
    status?: "good" | "watch";
    message?: string;
    assessment?: string;
    insights?: string;
    recommendation?: string;
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

type StatusTone = "good" | "watch";

type AnalysisRowItem = {
  key: string;
  title: string;
  icon: typeof Flame;
  iconClassName: string;
  status: string;
  tone: StatusTone;
  body: string;
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

function sanitizeNote(text: string | null | undefined) {
  if (!text) return null;
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  return normalized;
}

function firstSentence(text: string | null | undefined) {
  const normalized = sanitizeNote(text);
  if (!normalized) return null;
  const match = normalized.match(/^.*?[.!?](?:\s|$)/);
  return (match ? match[0] : normalized).trim();
}

function trimClause(text: string | null | undefined, maxLength = 96) {
  const normalized = firstSentence(text);
  if (!normalized) return null;
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength).trimEnd()}...`;
}

function pillClasses(tone: StatusTone) {
  switch (tone) {
    case "good":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "watch":
    default:
      return "border-red-200 bg-red-50 text-red-700";
  }
}

function rowClasses(tone: StatusTone) {
  switch (tone) {
    case "good":
      return "rounded-lg border border-emerald-200/80 bg-emerald-50/45 px-3 py-2.5";
    case "watch":
    default:
      return "rounded-lg border border-red-200/80 bg-red-50/45 px-3 py-2.5";
  }
}

function resolveLegacyMessage(parts: Array<string | null | undefined>) {
  for (const part of parts) {
    const value = trimClause(part);
    if (value) return value;
  }
  return null;
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
      className={cn("space-y-1.5", rowClasses(item.tone))}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <Icon size={15} className={cn("mt-0.5 shrink-0", item.iconClassName)} />
            <h2 className="text-sm font-semibold text-stone-900">{item.title}</h2>
          </div>
          <p className="text-[13px] leading-snug text-stone-700">{item.body}</p>
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
  const currentWaterTarget = useMemo(() => {
    for (let idx = dailyHistory.length - 1; idx >= 0; idx -= 1) {
      const candidate = dailyHistory[idx]?.waterTarget;
      if (typeof candidate === "number" && Number.isFinite(candidate) && candidate > 0) {
        return candidate;
      }
    }
    return null;
  }, [dailyHistory]);

  const fallbackAI = useMemo<AIReportPayload | null>(() => {
    if (!stats) return null;

    const isCalorieGood = stats.averageNetCalories !== null && stats.averageNetCalories <= 0;
    const calorieMessage = isCalorieGood
      ? `Average intake is staying within or below your current calorie quota.`
      : `Average intake is above your current calorie quota.`;

    const targetProtein = 100;
    const isProteinGood = stats.averageProteinG >= targetProtein;
    const proteinMessage = isProteinGood
      ? "Protein intake looks solid for everyday recovery and satiety."
      : "Protein intake is light for recovery and satiety.";

    const hydrationTarget = currentWaterTarget ?? 2000;
    const hydrationRate = Math.round((stats.averageWaterMl / hydrationTarget) * 100);
    const isWaterGood = hydrationRate >= 90 && hydrationRate <= 140;
    const waterMessage = isWaterGood
      ? "Hydration is on track against your current target."
      : hydrationRate < 90
        ? "Hydration is below your current target."
        : "Hydration is running unusually high above target.";

    const totalMacrosG =
      (stats.averageProteinG || 0) + (stats.averageFatG || 0) + (stats.averageCarbsG || 0) || 1;
    const carbsPct = Math.round(((stats.averageCarbsG || 0) / totalMacrosG) * 100);
    const isMacroGood = carbsPct <= 50;
    const macroMessage = isMacroGood
      ? "Macro split looks reasonably balanced."
      : "Carbohydrates are carrying most of the intake.";

    return {
      waterAnalysis: {
        status: isWaterGood ? "good" : "watch",
        message: waterMessage,
      },
      calorieAnalysis: {
        status: isCalorieGood ? "good" : "watch",
        message: calorieMessage,
      },
      proteinAnalysis: {
        status: isProteinGood ? "good" : "watch",
        message: proteinMessage,
      },
      macroAnalysis: {
        status: isMacroGood ? "good" : "watch",
        message: macroMessage,
      },
    };
  }, [currentWaterTarget, stats]);

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
      const calorieTone: StatusTone =
        calorieAnalysis.status === "good"
          ? "good"
          : calorieAnalysis.status === "watch"
            ? "watch"
            : stats.averageNetCalories !== null && stats.averageNetCalories <= 0
              ? "good"
              : "watch";
      const calorieNet =
        stats.averageNetCalories === null
          ? "Net unavailable"
          : stats.averageNetCalories <= 0
            ? `${Math.abs(stats.averageNetCalories)} kcal deficit`
            : `${stats.averageNetCalories} kcal surplus`;
      const calorieFollowup =
        trimClause(calorieAnalysis.message) ||
        resolveLegacyMessage([
          calorieAnalysis.alerts?.[0],
          calorieAnalysis.recommendation,
          calorieAnalysis.insights,
        ]);

      rows.push({
        key: "calories",
        title: "Calorie outcome",
        icon: Flame,
        iconClassName: "text-orange-500",
        status: calorieTone === "good" ? "Good" : "Watch",
        tone: calorieTone,
        body: `You averaged ${calorieNet} with intake at ${stats.averageIntakeCalories} kcal${
          stats.averageQuotaCalories != null ? ` against a target of ${stats.averageQuotaCalories} kcal.` : "."
        }${calorieFollowup ? ` ${calorieFollowup}` : ""}`,
      });
    }

    if (proteinAnalysis) {
      const isProteinGood =
        proteinAnalysis.status === "good"
          ? true
          : proteinAnalysis.status === "watch"
            ? false
            : stats.averageProteinG >= 100;
      const proteinFollowup =
        trimClause(proteinAnalysis.message) ||
        resolveLegacyMessage([
          proteinAnalysis.recommendation,
          proteinAnalysis.alerts?.[0],
          proteinAnalysis.insights,
        ]);
      rows.push({
        key: "protein",
        title: "Protein intake",
        icon: Dumbbell,
        iconClassName: "text-stone-600",
        status: isProteinGood ? "Good" : "Watch",
        tone: isProteinGood ? "good" : "watch",
        body: `You averaged ${stats.averageProteinG} g/day.${proteinFollowup ? ` ${proteinFollowup}` : ""}`,
      });
    }

    if (waterAnalysis) {
      const waterTarget = currentWaterTarget ?? 2000;
      const completionRate = Math.round((stats.averageWaterMl / waterTarget) * 100);
      const waterTone: StatusTone =
        waterAnalysis.status === "good"
          ? "good"
          : waterAnalysis.status === "watch"
            ? "watch"
            : completionRate >= 90 && completionRate <= 140
              ? "good"
              : "watch";
      const waterFollowup =
        trimClause(waterAnalysis.message) ||
        resolveLegacyMessage([waterAnalysis.insights, waterAnalysis.recommendation]);
      rows.push({
        key: "water",
        title: "Water intake",
        icon: Droplets,
        iconClassName: "text-sky-500",
        status: waterTone === "good" ? "Good" : "Watch",
        tone: waterTone,
        body: `You averaged ${stats.averageWaterMl} ml/day against a target of ${waterTarget} ml (${completionRate}%).${
          waterFollowup ? ` ${waterFollowup}` : ""
        }`,
      });
    }

    if (macroAnalysis) {
      const dominantMacro = [
        { label: "carbs", value: macroMetrics.carbsPct },
        { label: "fat", value: macroMetrics.fatPct },
        { label: "protein", value: macroMetrics.proteinPct },
      ].sort((a, b) => b.value - a.value)[0];
      const macroGood =
        macroAnalysis.status === "good"
          ? true
          : macroAnalysis.status === "watch"
            ? false
            : macroMetrics.carbsPct <= 50;
      const macroFollowup =
        trimClause(macroAnalysis.message) ||
        resolveLegacyMessage([macroAnalysis.insights, macroAnalysis.recommendation]);
      rows.push({
        key: "macros",
        title: "Nutrient ratios",
        icon: PieChart,
        iconClassName: "text-emerald-500",
        status: macroGood ? "Good" : "Watch",
        tone: macroGood ? "good" : "watch",
        body: `Split is ${macroMetrics.carbsPct}% carbs, ${macroMetrics.fatPct}% fat, ${macroMetrics.proteinPct}% protein. ${
          macroGood
            ? `${dominantMacro.label[0].toUpperCase()}${dominantMacro.label.slice(1)} is leading, but the mix still looks reasonable.`
            : macroFollowup || `${dominantMacro.label[0].toUpperCase()}${dominantMacro.label.slice(1)} is doing most of the work here.`
        }`,
      });
    }

    return rows;
  }, [calorieAnalysis, currentWaterTarget, macroAnalysis, macroMetrics, proteinAnalysis, stats, waterAnalysis]);

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
        <div className="space-y-2">
          {analysisRows.map((item) => (
            <AnalysisStatusRow key={item.key} item={item} />
          ))}
        </div>
      </div>
    </div>
  );
}
