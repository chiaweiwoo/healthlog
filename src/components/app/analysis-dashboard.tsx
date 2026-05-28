"use client";

import { useMemo, useState } from "react";
import { Calendar, Flame, Dumbbell, Droplets, PieChart, Compass, BookOpen, Utensils, Activity } from "lucide-react";
import { AnalysisStats, FocusArea, ProfileGap } from "@/lib/schemas";
import { cn } from "@/lib/utils";

type DeeperAnalysisRow = {
  status: "good" | "watch";
  message: string;
  examples: Array<{
    date: string;
    time: string | null;
    rawNote: string;
    parsedInfo: string;
    reason: string;
  }>;
};

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
  overallAnalysis?: DeeperAnalysisRow;
  loggingHabitAnalysis?: DeeperAnalysisRow;
  mealChoiceAnalysis?: DeeperAnalysisRow;
  exerciseHabitAnalysis?: DeeperAnalysisRow;
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

type EnergySplitEntry = AnalysisStats["energySplit"]["entries"][number];

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

function trimClause(text: string | null | undefined, maxLength = 72) {
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
      return "rounded-lg border border-emerald-200/80 bg-emerald-50/45 px-3 py-2";
    case "watch":
    default:
      return "rounded-lg border border-red-200/80 bg-red-50/45 px-3 py-2";
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
      className={cn("space-y-1", rowClasses(item.tone))}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-0.5">
          <div className="flex items-center gap-2">
            <Icon size={15} className={cn("mt-0.5 shrink-0", item.iconClassName)} />
            <h2 className="text-sm font-semibold text-stone-900">{item.title}</h2>
          </div>
          <p className="text-[12px] leading-snug text-stone-700">{item.body}</p>
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

function DeeperStatusRow({
  title,
  icon: Icon,
  iconClassName,
  data,
}: {
  title: string;
  icon: typeof Compass;
  iconClassName: string;
  data: DeeperAnalysisRow;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const statusLabel = data.status === "good" ? "Good" : "Watch";
  const hasExamples = data.examples && data.examples.length > 0;

  return (
    <section
      data-testid={`deeper-row-${title.toLowerCase().replace(/\s+/g, "-")}`}
      onClick={() => {
        if (hasExamples) setIsExpanded(!isExpanded);
      }}
      className={cn(
        "space-y-2.5 transition-all duration-200 select-none",
        rowClasses(data.status),
        hasExamples ? "cursor-pointer hover:bg-stone-50/30" : "cursor-default"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-0.5">
          <div className="flex items-center gap-2">
            <Icon size={15} className={cn("mt-0.5 shrink-0", iconClassName)} />
            <h2 className="text-sm font-semibold text-stone-900">{title}</h2>
            {hasExamples && (
              <span className="text-[9px] text-stone-400 font-bold uppercase tracking-wider bg-white/80 border border-stone-200/50 px-1 py-0.2 rounded leading-none">
                {isExpanded ? "Collapse" : `+${data.examples.length} Evidence`}
              </span>
            )}
          </div>
          <p className="text-[12px] leading-snug text-stone-700">{data.message}</p>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold leading-none",
            pillClasses(data.status),
          )}
        >
          {statusLabel}
        </span>
      </div>

      {isExpanded && hasExamples && (
        <div className="space-y-2 border-t border-stone-200/40 pt-2 animate-fadeIn">
          {data.examples.slice(0, 3).map((ex, idx) => {
            const timeStr = ex.time ? `, ${ex.time}` : "";
            const formattedDate = formatDate(ex.date) + timeStr;
            return (
              <div
                key={idx}
                className="bg-white/80 border border-stone-100 rounded-md p-2 text-[11.5px] space-y-1 shadow-2xs"
              >
                <div className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">
                  {formattedDate}
                </div>
                <div className="text-stone-850">
                  <span className="text-stone-400 text-[9px] font-bold uppercase mr-1">Log:</span>
                  &quot;{ex.rawNote}&quot;
                </div>
                <div className="text-stone-700">
                  <span className="text-stone-400 text-[9px] font-bold uppercase mr-1">Parsed:</span>
                  {ex.parsedInfo}
                </div>
                <div className="text-indigo-800 text-[11px] bg-indigo-50/40 rounded px-1.5 py-0.5 inline-block font-medium">
                  <span className="font-semibold text-indigo-900">Reason:</span> {ex.reason}
                </div>
              </div>
            );
          })}
        </div>
      )}
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
      ? "Intake is on target; keep this pace."
      : "Surplus is high; trim dense extras.";

    const targetProtein = 100;
    const isProteinGood = stats.averageProteinG >= targetProtein;
    const proteinMessage = isProteinGood
      ? "Protein looks solid; keep it steady."
      : "Protein is light; add a lean serving.";

    const hydrationTarget = currentWaterTarget ?? 2000;
    const hydrationRate = Math.round((stats.averageWaterMl / hydrationTarget) * 100);
    const isWaterGood = hydrationRate >= 90 && hydrationRate <= 140;
    const waterMessage = isWaterGood
      ? "Hydration is on track; keep it up."
      : hydrationRate < 90
        ? "Hydration is low; add water earlier."
        : "Hydration is high; spread intake out.";

    const energyEntries = stats.energySplit.entries;
    const proteinShare = energyEntries.find((entry) => entry.label === "protein")?.percentage ?? 0;
    const carbsShare = energyEntries.find((entry) => entry.label === "carbs")?.percentage ?? 0;
    const fatShare = energyEntries.find((entry) => entry.label === "fat")?.percentage ?? 0;
    const alcoholShare = energyEntries.find((entry) => entry.label === "alcohol")?.percentage ?? 0;
    const isMacroGood = alcoholShare < 10 && carbsShare <= 55 && fatShare <= 40 && proteinShare >= 15;
    const macroMessage =
      alcoholShare >= 10
        ? "Alcohol share is high; cut drink calories."
        : proteinShare < 15
          ? "Protein share is low; add lean protein."
          : carbsShare > 55
            ? "Carbs lead calories; rebalance meals."
            : fatShare > 40
              ? "Fat is heavy; trim rich items."
              : "Energy split looks balanced overall.";

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

  const overallAnalysis = report?.overallAnalysis || {
    status: stats.consistencyScore >= 0.7 ? "good" : "watch",
    message: stats.consistencyScore >= 0.7
      ? "Tracking consistency is good; align intake with active fitness goals."
      : "Logging is sparse; track more days to establish a clear trend.",
    examples: [],
  };

  const loggingHabitAnalysis = report?.loggingHabitAnalysis || {
    status: stats.consistencyScore >= 0.8 ? "good" : "watch",
    message: stats.consistencyScore >= 0.8
      ? "Daily meal logs are frequent and timestamped consistently."
      : "Try to log meals closer to when they occur to preserve timing details.",
    examples: [],
  };

  const mealChoiceAnalysis = report?.mealChoiceAnalysis || {
    status: stats.averageProteinG >= 100 ? "good" : "watch",
    message: stats.averageProteinG >= 100
      ? "Meal selections provide high protein density to support muscle mass."
      : "Focus on pairing high-protein sources with calorie-dense meals.",
    examples: [],
  };

  const exerciseHabitAnalysis = report?.exerciseHabitAnalysis || {
    status: stats.averageExerciseCalories >= 150 ? "good" : "watch",
    message: stats.averageExerciseCalories >= 150
      ? "Logged workout energy matches profile baseline activity levels."
      : "Record workout sessions regularly to ensure precise TDEE calculations.",
    examples: [],
  };

  const consistencyPills = useMemo(() => {
    const pills = Array.from({ length: totalDaysInPeriod }).map((_, idx) => {
      if (idx < dailyHistory.length) {
        return dailyHistory[idx].isLogged;
      }
      return idx < stats.completeDays;
    });
    return pills;
  }, [dailyHistory, stats.completeDays]);

  const energySplitEntries = useMemo(
    () => stats.energySplit.entries.filter((entry) => entry.calories > 0),
    [stats.energySplit.entries],
  );

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
        title: "Calorie Outcome",
        icon: Flame,
        iconClassName: "text-orange-500",
        status: calorieTone === "good" ? "Good" : "Watch",
        tone: calorieTone,
        body: calorieFollowup || `${calorieNet}. Intake ${stats.averageIntakeCalories} kcal${
          stats.averageQuotaCalories != null ? ` vs target ${stats.averageQuotaCalories} kcal.` : "."
        }`,
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
        title: "Protein Intake",
        icon: Dumbbell,
        iconClassName: "text-stone-600",
        status: isProteinGood ? "Good" : "Watch",
        tone: isProteinGood ? "good" : "watch",
        body: proteinFollowup || `${stats.averageProteinG} g/day average.`,
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
        title: "Water Intake",
        icon: Droplets,
        iconClassName: "text-sky-500",
        status: waterTone === "good" ? "Good" : "Watch",
        tone: waterTone,
        body: waterFollowup || `${stats.averageWaterMl} ml/day vs ${waterTarget} ml target (${completionRate}%).`,
      });
    }

    if (macroAnalysis) {
      const energyShares = Object.fromEntries(
        stats.energySplit.entries.map((entry) => [entry.label, entry.percentage]),
      ) as Record<EnergySplitEntry["label"], number>;
      const dominantSource =
        [...stats.energySplit.entries].sort((a, b) => b.percentage - a.percentage)[0] ?? null;
      const macroGood =
        macroAnalysis.status === "good"
          ? true
          : macroAnalysis.status === "watch"
            ? false
            : energyShares.alcohol < 10 &&
              energyShares.carbs <= 55 &&
              energyShares.fat <= 40 &&
              energyShares.protein >= 15;
      const macroFollowup =
        trimClause(macroAnalysis.message) ||
        resolveLegacyMessage([macroAnalysis.insights, macroAnalysis.recommendation]);
      const splitSummary =
        energySplitEntries.length > 0
          ? energySplitEntries
              .map((entry) => `${entry.percentage}% ${entry.label}`)
              .join(", ")
          : null;
      const fallbackMacroMessage = dominantSource
        ? `${dominantSource.label[0].toUpperCase()}${dominantSource.label.slice(1)} is contributing the biggest share of intake calories.`
        : "Energy decomposition needs more logged intake data.";
      rows.push({
        key: "macros",
        title: "Energy Split",
        icon: PieChart,
        iconClassName: "text-emerald-500",
        status: macroGood ? "Good" : "Watch",
        tone: macroGood ? "good" : "watch",
        body: macroFollowup || (splitSummary ? `${splitSummary}. ${fallbackMacroMessage}` : fallbackMacroMessage),
      });
    }

    return rows;
  }, [calorieAnalysis, currentWaterTarget, energySplitEntries, macroAnalysis, proteinAnalysis, stats, waterAnalysis]);

  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 py-4">
      {/* 1. HEADER DATE PICKER & TIMELINE CAROUSEL ROW */}
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

      {/* 2. CORE PERSPECTIVES PANEL */}
      <div className="rounded-xl border border-stone-200 bg-stone-50/60 px-4 py-3 shadow-sm">
        <div className="space-y-2">
          {analysisRows.map((item) => (
            <AnalysisStatusRow key={item.key} item={item} />
          ))}
        </div>
      </div>

      {/* 3. DEEPER REVIEW PANEL */}
      <div className="rounded-xl border border-stone-200 bg-stone-50/60 px-4 py-3 shadow-sm space-y-3">
        <div className="border-b border-stone-200/60 pb-1.5">
          <h2 className="text-[10px] font-bold uppercase tracking-wider text-stone-400">
            Deeper Review
          </h2>
        </div>
        <div className="space-y-2">
          <DeeperStatusRow
            title="Overall Direction"
            icon={Compass}
            iconClassName="text-indigo-500"
            data={overallAnalysis}
          />
          <DeeperStatusRow
            title="Logging Habit"
            icon={BookOpen}
            iconClassName="text-stone-500"
            data={loggingHabitAnalysis}
          />
          <DeeperStatusRow
            title="Meal Choices"
            icon={Utensils}
            iconClassName="text-amber-500"
            data={mealChoiceAnalysis}
          />
          <DeeperStatusRow
            title="Exercise Fit"
            icon={Activity}
            iconClassName="text-emerald-500"
            data={exerciseHabitAnalysis}
          />
        </div>
      </div>
    </div>
  );
}
