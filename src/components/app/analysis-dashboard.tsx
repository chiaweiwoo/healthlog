"use client";

import { useMemo, useState } from "react";
import { Calendar, Flame, Dumbbell, Droplets, PieChart, BookOpen, Utensils, Activity, Info } from "lucide-react";
import { AnalysisStats, FocusArea, ProfileGap } from "@/lib/schemas";
import { cn } from "@/lib/utils";

type DeeperAnalysisRow = {
  status: "good" | "watch";
  message: string;
  examples: Array<{
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

function UnifiedAnalysisRow({
  item,
  onShowEvidence,
}: {
  item: UnifiedRowItem;
  onShowEvidence?: (title: string, examples: Exclude<UnifiedRowItem["examples"], undefined>) => void;
}) {
  const Icon = item.icon;
  const hasEvidence = item.examples && item.examples.length > 0;

  return (
    <section
      data-testid={`analysis-row-${item.key}`}
      className={cn("space-y-1", rowClasses(item.tone))}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-0.5 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <Icon size={15} className={cn("shrink-0", item.iconClassName)} />
            <h2 className="text-sm font-semibold text-stone-900 leading-none">{item.title}</h2>
            {hasEvidence && onShowEvidence && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onShowEvidence(item.title, item.examples || []);
                }}
                className="inline-flex items-center justify-center text-stone-400 hover:text-stone-600 focus:outline-hidden transition-colors cursor-pointer"
                title="View evidence"
                aria-label={`View evidence for ${item.title}`}
              >
                <Info size={13} />
              </button>
            )}
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

function EvidenceModal({
  isOpen,
  onClose,
  title,
  examples,
}: {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  examples: Array<{
    date: string;
    time: string | null;
    parsedSummary?: string;
    parsedInfo?: string;
    reason: string;
    confidence?: number | null;
  }>;
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
      <div className="rounded-xl border border-stone-200 bg-stone-50/60 px-4 py-3 shadow-sm flex items-center justify-between text-xs text-stone-700 font-medium">
        <div className="flex items-center gap-1">
          <span className="font-bold text-stone-900 text-sm">7</span> checks
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500 border border-emerald-600/25" />
            <span className="font-bold text-emerald-700">{goodCount}</span> Good
          </div>
          <div className="flex items-center gap-1">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-500 border border-red-600/25" />
            <span className="font-bold text-red-700">{watchCount}</span> Watch
          </div>
        </div>
        <div className="text-stone-500">
          <span className="font-bold text-stone-700">{stats.completeDays}</span> / 14 logged
        </div>
      </div>

      {/* 3. UNIFIED ANALYSIS rows PANEL */}
      <div className="rounded-xl border border-stone-200 bg-stone-50/60 px-4 py-3 shadow-sm">
        <div className="space-y-2">
          {analysisRows.map((item) => (
            <UnifiedAnalysisRow
              key={item.key}
              item={item}
              onShowEvidence={(title, examples) => {
                setModalTitle(title);
                setModalExamples(examples);
                setIsModalOpen(true);
              }}
            />
          ))}
        </div>
      </div>

      {/* Evidence Modal Component */}
      <EvidenceModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={modalTitle}
        examples={modalExamples}
      />
    </div>
  );
}
