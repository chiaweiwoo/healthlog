"use client";

import { useMemo, useState } from "react";
import { Calendar, Flame, Dumbbell, Droplets, PieChart, BookOpen, Utensils, Activity } from "lucide-react";
import { AnalysisStats, FocusArea, ProfileGap } from "@/lib/schemas";
import { cn } from "@/lib/utils";

type DeeperAnalysisRow = {
  status: "good" | "watch";
  message: string;
  examples?: Array<{
    date: string;
    time: string | null;
    parsedSummary?: string;
    parsedInfo?: string;
    reason: string;
    confidence?: number | null;
  }>;
};

type AIReportPayload = {
  summary?: string;
  rootCauses?: string[];
  focusAreas?: FocusArea[];
  profileGaps?: ProfileGap[];
  confidence?: "low" | "medium" | "high";
  waterAnalysis?: DeeperAnalysisRow;
  calorieAnalysis?: DeeperAnalysisRow;
  proteinAnalysis?: DeeperAnalysisRow;
  macroAnalysis?: DeeperAnalysisRow;
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

type UnifiedRowItem = {
  key: string;
  title: string;
  icon: typeof Flame;
  iconClassName: string;
  status: "Good" | "Watch";
  tone: StatusTone;
  body: string;
  examples?: Array<{
    date: string;
    time: string | null;
    parsedSummary?: string;
    parsedInfo?: string;
    reason: string;
    confidence?: number | null;
  }>;
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

function trimClause(text: string | null | undefined) {
  return firstSentence(text);
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

function UnifiedAnalysisRow({
  item,
  hasEvidence,
  onShowEvidence,
}: {
  item: UnifiedRowItem;
  hasEvidence: boolean;
  onShowEvidence?: (title: string, examples: Exclude<UnifiedRowItem["examples"], undefined>) => void;
}) {
  const Icon = item.icon;
  const isClickable = hasEvidence && onShowEvidence;

  return (
    <section
      data-testid={`analysis-row-${item.key}`}
      onClick={() => {
        if (isClickable) {
          onShowEvidence(item.title, item.examples || []);
        }
      }}
      onKeyDown={(e) => {
        if (isClickable && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onShowEvidence(item.title, item.examples || []);
        }
      }}
      role={isClickable ? "button" : undefined}
      tabIndex={isClickable ? 0 : undefined}
      className={cn(
        "space-y-1 select-none outline-hidden",
        rowClasses(item.tone),
        isClickable && "cursor-pointer hover:shadow-xs hover:scale-[1.01] active:scale-[0.99] transition-all duration-150"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-0.5 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <Icon size={15} className={cn("shrink-0", item.iconClassName)} />
            <h2 className="text-sm font-semibold text-stone-900 leading-none">{item.title}</h2>
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

function MiniTrendBars({
  metricKey,
  dailyHistory,
  targetValue,
}: {
  metricKey: string;
  dailyHistory: DailyHistoryItem[];
  targetValue?: number | null;
}) {
  if (!dailyHistory || dailyHistory.length === 0) return null;

  const days = dailyHistory.slice(-14);

  return (
    <div className="space-y-1.5 border-b border-stone-200/60 pb-3 select-none">
      <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-stone-400">
        <span>14-Day Trend</span>
        <span className="text-[9px] lowercase font-normal italic">hover/tap bars for details</span>
      </div>
      <div className="flex items-end gap-1 h-12 pt-2 bg-stone-50/50 rounded-lg px-2 border border-stone-200/30">
        {days.map((day, idx) => {
          let heightPercent = 0;
          let barBg = "bg-stone-300";
          let label = "";

          const formattedDate = formatDate(day.date);

          if (metricKey === "calories") {
            const target = targetValue ?? 2000;
            const value = day.calories;
            heightPercent = Math.min((value / Math.max(target * 1.5, 3000)) * 100, 100);
            const isAbove = value > target;
            barBg = isAbove ? "bg-red-500" : "bg-emerald-500";
            label = `${formattedDate}: ${value} kcal (Target: ${target} kcal)`;
          } else if (metricKey === "protein") {
            const target = targetValue ?? 100;
            const value = day.proteinG;
            heightPercent = Math.min((value / Math.max(target * 1.5, 150)) * 100, 100);
            const isGood = value >= target;
            barBg = isGood ? "bg-emerald-500" : "bg-red-400";
            label = `${formattedDate}: ${value}g protein (Target: ${target}g)`;
          } else if (metricKey === "water") {
            const target = targetValue ?? 2000;
            const value = day.waterMl;
            heightPercent = Math.min((value / Math.max(target * 1.5, 3000)) * 100, 100);
            const isLow = value < target * 0.9;
            const isHigh = value > target * 1.4;
            barBg = isLow ? "bg-amber-400" : isHigh ? "bg-sky-600" : "bg-sky-500";
            label = `${formattedDate}: ${value}ml water (Target: ${target}ml)`;
          } else if (metricKey === "macros") {
            const calories = {
              protein: day.proteinG * 4,
              carbs: day.carbsG * 4,
              fat: day.fatG * 9,
              alcohol: day.alcoholG * 7,
            };
            const total = calories.protein + calories.carbs + calories.fat + calories.alcohol;
            let dominant: "protein" | "carbs" | "fat" | "alcohol" | "none" = "none";
            let maxCals = 0;
            if (total > 0) {
              if (calories.protein > maxCals) { dominant = "protein"; maxCals = calories.protein; }
              if (calories.carbs > maxCals) { dominant = "carbs"; maxCals = calories.carbs; }
              if (calories.fat > maxCals) { dominant = "fat"; maxCals = calories.fat; }
              if (calories.alcohol > maxCals) { dominant = "alcohol"; maxCals = calories.alcohol; }
            }

            heightPercent = total > 0 ? Math.min((total / 3000) * 100, 100) : 0;
            if (dominant === "protein") barBg = "bg-stone-600";
            else if (dominant === "carbs") barBg = "bg-amber-500";
            else if (dominant === "fat") barBg = "bg-emerald-500";
            else if (dominant === "alcohol") barBg = "bg-red-500";
            else barBg = "bg-stone-200";

            const sharePercent = total > 0 ? Math.round((maxCals / total) * 100) : 0;
            label = total > 0
              ? `${formattedDate}: ${Math.round(total)} kcal (Dominant: ${dominant} ${sharePercent}%)`
              : `${formattedDate}: No logs`;
          } else if (metricKey === "logging") {
            heightPercent = day.isLogged ? 100 : 20;
            barBg = day.isLogged ? "bg-emerald-500" : "bg-stone-300";
            label = `${formattedDate}: ${day.isLogged ? "Logged" : "Unlogged"}`;
          } else if (metricKey === "meals") {
            const fatRatio = (day.fatG * 9) / (day.proteinG * 4 + day.carbsG * 4 + day.fatG * 9 + day.alcoholG * 7 || 1);
            const isHighFat = fatRatio > 0.4;
            heightPercent = day.isLogged ? (isHighFat ? 105 : 40) : 0;
            barBg = isHighFat ? "bg-red-400" : "bg-emerald-500";
            label = `${formattedDate}: ${isHighFat ? "High fat-ratio choice" : "Balanced meal choice"}`;
          } else if (metricKey === "exercise") {
            const value = day.exerciseCalories;
            heightPercent = Math.min((value / 1000) * 100, 100);
            barBg = value > 0 ? "bg-emerald-500" : "bg-stone-300";
            label = `${formattedDate}: ${value} kcal burned via exercise`;
          }

          return (
            <div
              key={idx}
              className={cn("flex-1 rounded-t-sm transition-all cursor-pointer", barBg)}
              style={{ height: `${Math.max(heightPercent, 4)}%` }}
              title={label}
            />
          );
        })}
      </div>
    </div>
  );
}

function EvidenceModal({
  isOpen,
  onClose,
  title,
  metricKey,
  examples,
  dailyHistory,
  targetValue,
}: {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  metricKey: string;
  examples: Array<{
    date: string;
    time: string | null;
    parsedSummary?: string;
    parsedInfo?: string;
    reason: string;
    confidence?: number | null;
  }>;
  dailyHistory: DailyHistoryItem[];
  targetValue?: number | null;
}) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 backdrop-blur-xs p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl border border-stone-200 bg-white p-5 shadow-lg space-y-4 max-h-[85vh] overflow-y-auto animate-fadeIn"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-stone-200 pb-2">
          <h3 className="text-sm font-bold text-stone-950">{title} Evidence</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-stone-450 hover:text-stone-600 text-xs font-semibold px-2 py-1 rounded-md hover:bg-stone-100 transition-colors"
          >
            Close
          </button>
        </div>

        {/* Mini 14-day Trend Visualization */}
        <MiniTrendBars
          metricKey={metricKey}
          dailyHistory={dailyHistory}
          targetValue={targetValue}
        />

        {examples && examples.length > 0 ? (
          <div className="space-y-3">
            {examples.map((ex, idx) => {
              const timeStr = ex.time ? `, ${ex.time}` : "";
              const formattedDate = formatDate(ex.date) + timeStr;
              const parsedSummary = ex.parsedSummary || ex.parsedInfo || "N/A";
              const confidencePercent = typeof ex.confidence === "number"
                ? `${Math.round(ex.confidence * 100)}%`
                : null;

              return (
                <div
                  key={idx}
                  className="rounded-lg border border-stone-150 bg-stone-50/40 p-3 space-y-2 text-[12px]"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400">
                      {formattedDate}
                    </span>
                    {confidencePercent && (
                      <span className="text-[9px] font-medium text-stone-500 bg-stone-200/50 px-1.5 py-0.5 rounded">
                        Confidence: {confidencePercent}
                      </span>
                    )}
                  </div>

                  <div className="text-stone-850 font-medium leading-snug">
                    {parsedSummary}
                  </div>

                  <div className="border-t border-stone-200/40 pt-1.5 text-stone-600 leading-snug">
                    <span className="font-semibold text-stone-700">Reason:</span> {ex.reason}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-[11.5px] text-stone-550 leading-snug italic text-center py-2">
            No specific logged timeline evidence returned for this category.
          </p>
        )}
      </div>
    </div>
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
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalTitle, setModalTitle] = useState("");
  const [modalMetricKey, setModalMetricKey] = useState("");
  const [modalTargetValue, setModalTargetValue] = useState<number | null>(null);
  const [modalExamples, setModalExamples] = useState<Array<{
    date: string;
    time: string | null;
    parsedSummary?: string;
    parsedInfo?: string;
    reason: string;
    confidence?: number | null;
  }>>([]);

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

  const analysisRows = useMemo<UnifiedRowItem[]>(() => {
    const rows: UnifiedRowItem[] = [];

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
          calorieAnalysis.message,
          (calorieAnalysis as Record<string, unknown>).recommendation as string | undefined,
          (calorieAnalysis as Record<string, unknown>).insights as string | undefined,
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
        examples: calorieAnalysis.examples,
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
          proteinAnalysis.message,
          (proteinAnalysis as Record<string, unknown>).recommendation as string | undefined,
          (proteinAnalysis as Record<string, unknown>).insights as string | undefined,
        ]);
      rows.push({
        key: "protein",
        title: "Protein Intake",
        icon: Dumbbell,
        iconClassName: "text-stone-600",
        status: isProteinGood ? "Good" : "Watch",
        tone: isProteinGood ? "good" : "watch",
        body: proteinFollowup || `${stats.averageProteinG} g/day average.`,
        examples: proteinAnalysis.examples,
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
        resolveLegacyMessage([
          waterAnalysis.message,
          (waterAnalysis as Record<string, unknown>).insights as string | undefined,
          (waterAnalysis as Record<string, unknown>).recommendation as string | undefined,
        ]);
      rows.push({
        key: "water",
        title: "Water Intake",
        icon: Droplets,
        iconClassName: "text-sky-500",
        status: waterTone === "good" ? "Good" : "Watch",
        tone: waterTone,
        body: waterFollowup || `${stats.averageWaterMl} ml/day vs ${waterTarget} ml target (${completionRate}%).`,
        examples: waterAnalysis.examples,
      });
    }

    if (macroAnalysis) {
      const dominantSource =
        [...stats.energySplit.entries].sort((a, b) => b.percentage - a.percentage)[0] ?? null;
      const macroGood =
        macroAnalysis.status === "good"
          ? true
          : macroAnalysis.status === "watch"
            ? false
            : true;
      const macroFollowup =
        trimClause(macroAnalysis.message) ||
        resolveLegacyMessage([
          macroAnalysis.message,
          (macroAnalysis as Record<string, unknown>).insights as string | undefined,
          (macroAnalysis as Record<string, unknown>).recommendation as string | undefined,
        ]);
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
        examples: macroAnalysis.examples,
      });
    }

    const loggingHabitAnalysis = report?.loggingHabitAnalysis || {
      status: stats.consistencyScore >= 0.8 ? "good" : "watch",
      message: stats.consistencyScore >= 0.8
        ? "Daily meal logs are frequent and timestamped consistently."
        : "Try to log meals closer to when they occur to preserve timing details.",
      examples: [],
    };

    const toneLogging: StatusTone = loggingHabitAnalysis.status === "good" ? "good" : "watch";
    rows.push({
      key: "logging",
      title: "Logging Habit",
      icon: BookOpen,
      iconClassName: "text-stone-500",
      status: loggingHabitAnalysis.status === "good" ? "Good" : "Watch",
      tone: toneLogging,
      body: loggingHabitAnalysis.message,
      examples: loggingHabitAnalysis.examples,
    });

    const mealChoiceAnalysis = report?.mealChoiceAnalysis || {
      status: stats.averageProteinG >= 100 ? "good" : "watch",
      message: stats.averageProteinG >= 100
        ? "Meal selections provide high protein density to support muscle mass."
        : "Focus on pairing high-protein sources with calorie-dense meals.",
      examples: [],
    };

    const toneMeals: StatusTone = mealChoiceAnalysis.status === "good" ? "good" : "watch";
    rows.push({
      key: "meals",
      title: "Meal Choices",
      icon: Utensils,
      iconClassName: "text-amber-500",
      status: mealChoiceAnalysis.status === "good" ? "Good" : "Watch",
      tone: toneMeals,
      body: mealChoiceAnalysis.message,
      examples: mealChoiceAnalysis.examples,
    });

    const exerciseHabitAnalysis = report?.exerciseHabitAnalysis || {
      status: stats.averageExerciseCalories >= 150 ? "good" : "watch",
      message: stats.averageExerciseCalories >= 150
        ? "Logged workout energy matches profile baseline activity levels."
        : "Record workout sessions regularly to ensure precise TDEE calculations.",
      examples: [],
    };

    const toneExercise: StatusTone = exerciseHabitAnalysis.status === "good" ? "good" : "watch";
    rows.push({
      key: "exercise",
      title: "Exercise Fit",
      icon: Activity,
      iconClassName: "text-emerald-500",
      status: exerciseHabitAnalysis.status === "good" ? "Good" : "Watch",
      tone: toneExercise,
      body: exerciseHabitAnalysis.message,
      examples: exerciseHabitAnalysis.examples,
    });

    return rows;
  }, [
    calorieAnalysis,
    proteinAnalysis,
    waterAnalysis,
    macroAnalysis,
    report,
    stats,
    currentWaterTarget,
    energySplitEntries
  ]);

  const goodCount = useMemo(() => {
    return analysisRows.filter((r) => r.tone === "good").length;
  }, [analysisRows]);

  const watchCount = useMemo(() => {
    return analysisRows.filter((r) => r.tone === "watch").length;
  }, [analysisRows]);

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

      {/* 2. HEALTH SNAPSHOT CARD */}
      <div className="rounded-xl border border-stone-200 bg-stone-50/60 px-4 py-2.5 shadow-xs flex items-center justify-center gap-6 text-xs text-stone-700 font-medium">
        <div className="flex items-center gap-1">
          <span className="font-bold text-stone-900 text-sm">7</span> Checks
        </div>
        <div className="h-3 w-px bg-stone-200" />
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 border border-emerald-600/25" />
          <span className="font-bold text-emerald-700">{goodCount}</span> Good
        </div>
        <div className="h-3 w-px bg-stone-200" />
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 rounded-full bg-red-500 border border-red-600/25" />
          <span className="font-bold text-red-700">{watchCount}</span> Watch
        </div>
      </div>

      {/* 3. UNIFIED ANALYSIS rows LIST */}
      <div className="space-y-2 animate-fadeIn">
        {analysisRows.map((item) => (
          <UnifiedAnalysisRow
            key={item.key}
            item={item}
            hasEvidence={true}
            onShowEvidence={(title, examples) => {
              setModalTitle(title);
              setModalMetricKey(item.key);
              setModalExamples(examples);

              let target: number | null = null;
              if (item.key === "calories") target = stats.averageQuotaCalories;
              else if (item.key === "protein") target = 100;
              else if (item.key === "water") target = currentWaterTarget ?? 2000;
              setModalTargetValue(target);

              setIsModalOpen(true);
            }}
          />
        ))}
      </div>

      {/* Evidence Modal Component */}
      <EvidenceModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={modalTitle}
        metricKey={modalMetricKey}
        examples={modalExamples}
        dailyHistory={dailyHistory}
        targetValue={modalTargetValue}
      />
    </div>
  );
}
