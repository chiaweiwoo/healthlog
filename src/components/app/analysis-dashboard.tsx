"use client";

import { useMemo } from "react";
import {
  Calendar,
  AlertTriangle,
  Flame,
  Dumbbell,
  Droplets,
  PieChart,
} from "lucide-react";
import {
  AnalysisStats,
  FocusArea,
  ProfileGap,
} from "@/lib/schemas";
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

  // Formatting dates for the header
  const formatDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
    } catch {
      return dateStr;
    }
  };

  // 1. Dynamic Fallback Generation in case the report is pending or using the older schema
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

    const targetProtein = 100; // fallback standard protein goal
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

    const totalMacrosG = (stats.averageProteinG || 0) + (stats.averageFatG || 0) + (stats.averageCarbsG || 0) || 1;
    const proteinPct = Math.round(((stats.averageProteinG || 0) / totalMacrosG) * 100);
    const fatPct = Math.round(((stats.averageFatG || 0) / totalMacrosG) * 100);
    const carbsPct = Math.round(((stats.averageCarbsG || 0) / totalMacrosG) * 100);
    const macroAssessment = "Balanced";
    const macroInsights = `Your energy distribution averages ${proteinPct}% protein, ${fatPct}% fats, and ${carbsPct}% carbohydrates. This provides a baseline macro-nutrient profile.`;
    const macroRecommendation = "Consider adjusting fat and carb ratios depending on your active recovery and energy levels.";

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

  // Combine loaded AI report with fallbacks gracefully
  const waterAnalysis = report?.waterAnalysis || fallbackAI?.waterAnalysis;
  const calorieAnalysis = report?.calorieAnalysis || fallbackAI?.calorieAnalysis;
  const proteinAnalysis = report?.proteinAnalysis || fallbackAI?.proteinAnalysis;
  const macroAnalysis = report?.macroAnalysis || fallbackAI?.macroAnalysis;

  // Consistency pills mapping from the past 14 days history
  const consistencyPills = useMemo(() => {
    const pills = Array.from({ length: totalDaysInPeriod }).map((_, idx) => {
      if (idx < dailyHistory.length) {
        return dailyHistory[idx].isLogged;
      }
      return idx < stats.completeDays;
    });
    return pills;
  }, [dailyHistory, stats.completeDays]);

  // Determine macronutrient ratios
  const macroMetrics = useMemo(() => {
    const totalMacrosG = (stats.averageProteinG || 0) + (stats.averageFatG || 0) + (stats.averageCarbsG || 0) || 1;
    const proteinPct = Math.round(((stats.averageProteinG || 0) / totalMacrosG) * 100);
    const fatPct = Math.round(((stats.averageFatG || 0) / totalMacrosG) * 100);
    const carbsPct = Math.round(((stats.averageCarbsG || 0) / totalMacrosG) * 100);
    return { proteinPct, fatPct, carbsPct };
  }, [stats]);

  // Decision indicators: should we show the coaching insight text container?
  // Water: hide if water volume is optimal (isGood = true)
  const showWaterInsights = waterAnalysis && !waterAnalysis.isGood;

  // Calories: hide if in deficit (outcome = deficit) and there are no alerts
  const showCalorieInsights = calorieAnalysis && (
    calorieAnalysis.outcome === "surplus" || 
    (calorieAnalysis.alerts && calorieAnalysis.alerts.length > 0)
  );

  // Protein: hide if protein is optimal (>= 100g) and no alerts
  const isProteinGood = stats.averageProteinG >= 100;
  const showProteinInsights = proteinAnalysis && (
    !isProteinGood || 
    (proteinAnalysis.alerts && proteinAnalysis.alerts.length > 0)
  );

  // Macros: hide if assessment is "Balanced" or "Healthy" and no alerts/recommendations are high-priority
  const isMacroImbalanced = macroAnalysis && !(
    macroAnalysis.assessment === "Balanced" || 
    macroAnalysis.assessment === "Healthy"
  );
  const showMacroInsights = macroAnalysis && isMacroImbalanced;

  return (
    <div className="mx-auto max-w-2xl px-4 py-4 space-y-4">
      
      {/* 1. HEADER SECTION CARD (ULTRA COMPACT) */}
      <div className="rounded-xl border border-stone-200 bg-stone-50/60 px-4 py-3 shadow-sm flex items-center justify-between gap-4">
        <div className="space-y-0.5">
          <span className="text-[9px] font-bold uppercase tracking-wider text-stone-400">14-day rolling review</span>
          <h1 className="text-sm font-bold text-stone-900 flex items-center gap-1.5 leading-none">
            <Calendar size={14} className="text-stone-500 shrink-0" />
            {formatDate(stats.periodStart)} - {formatDate(stats.periodEnd)}
          </h1>
        </div>
        
        {/* Tracking consistency pills */}
        <div className="flex gap-0.5 w-32 shrink-0">
          {consistencyPills.map((isLogged, index) => (
            <div
              key={index}
              className={cn(
                "h-2 flex-1 rounded-full border border-stone-200/20 transition-colors duration-300",
                isLogged ? "bg-emerald-500" : "bg-stone-200"
              )}
            />
          ))}
        </div>
      </div>

      {/* 2. UNIFIED ANALYSIS DASHBOARD PANEL (NO SEPARATE CARDS) */}
      <div className="rounded-xl border border-stone-200 bg-stone-50/60 p-4 shadow-sm space-y-4">
        
        {/* SECTION A: Calorie Outcome / Energy Balance */}
        {calorieAnalysis && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Flame size={15} className="text-orange-500 shrink-0" />
                <span className="text-xs font-bold text-stone-800">Calorie Outcome</span>
              </div>
              <span className={cn(
                "px-2 py-0.5 text-[9px] font-bold border rounded-full capitalize leading-none",
                calorieAnalysis.outcome === "deficit"
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                  : "bg-amber-50 text-amber-700 border-amber-200"
              )}>
                {calorieAnalysis.outcome === "deficit" ? "Deficit" : "Surplus"}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-stone-600 px-0.5 font-medium">
              <div>
                <span className="text-stone-500 font-semibold uppercase tracking-wider text-[9px]">Intake</span> {stats.averageIntakeCalories} kcal
              </div>
              <div className="h-2.5 w-[1px] bg-stone-200" />
              <div>
                <span className="text-stone-500 font-semibold uppercase tracking-wider text-[9px]">TDEE Target</span> {stats.averageQuotaCalories || "N/A"} kcal
              </div>
              <div className="h-2.5 w-[1px] bg-stone-200" />
              <div>
                <span className="text-stone-500 font-semibold uppercase tracking-wider text-[9px]">Net</span>{" "}
                <span className={cn(
                  "font-bold",
                  stats.averageNetCalories !== null && stats.averageNetCalories <= 0 ? "text-emerald-600" : "text-amber-600"
                )}>
                  {stats.averageNetCalories !== null 
                    ? stats.averageNetCalories <= 0 
                      ? `-${Math.abs(stats.averageNetCalories)} kcal Deficit` 
                      : `+${stats.averageNetCalories} kcal Surplus`
                    : "N/A"}
                </span>
              </div>
            </div>

            {/* AI Coaching Advice */}
            {showCalorieInsights && (
              <div className="rounded-lg border border-indigo-100/60 bg-indigo-50/20 p-2 text-xs">
                <p className="text-stone-700 leading-relaxed text-[11px]">
                  {calorieAnalysis.insights} {calorieAnalysis.recommendation}
                </p>
                {calorieAnalysis.alerts && calorieAnalysis.alerts.length > 0 && (
                  <div className="mt-1 pt-1 border-t border-indigo-100/30 space-y-0.5">
                    {calorieAnalysis.alerts.map((alert, idx) => (
                      <div key={idx} className="flex gap-1 text-[10px] text-amber-800 items-center">
                        <AlertTriangle size={10} className="shrink-0 text-amber-600" />
                        <span>{alert}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <div className="border-t border-stone-200/60" />

        {/* SECTION B: Protein Intake */}
        {proteinAnalysis && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Dumbbell size={15} className="text-stone-600 shrink-0" />
                <span className="text-xs font-bold text-stone-800">Protein Intake</span>
              </div>
              <span className={cn(
                "px-2 py-0.5 text-[9px] font-bold border rounded-full leading-none",
                isProteinGood
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                  : "bg-amber-50 text-amber-700 border-amber-200"
              )}>
                {isProteinGood ? "Optimal" : "Low Protein"}
              </span>
            </div>

            <div className="text-xs text-stone-600 px-0.5 font-medium">
              Protein avg is <span className="font-bold text-stone-900">{stats.averageProteinG}g</span>
            </div>

            {/* AI Coaching Advice */}
            {showProteinInsights && (
              <div className="rounded-lg border border-indigo-100/60 bg-indigo-50/20 p-2 text-xs">
                <p className="text-stone-700 leading-relaxed text-[11px]">
                  {proteinAnalysis.insights} {proteinAnalysis.recommendation}
                </p>
              </div>
            )}
          </div>
        )}

        <div className="border-t border-stone-200/60" />

        {/* SECTION C: Water Intake */}
        {waterAnalysis && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Droplets size={15} className="text-sky-500 shrink-0" />
                <span className="text-xs font-bold text-stone-800">Water Intake</span>
              </div>
              <span className={cn(
                "px-2 py-0.5 text-[9px] font-bold border rounded-full leading-none",
                waterAnalysis.isGood
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                  : "bg-amber-50 text-amber-700 border-amber-200"
              )}>
                {waterAnalysis.isGood ? "Sufficient" : "Dehydrated"}
              </span>
            </div>

            {(() => {
              const completionRate = Math.round((stats.averageWaterMl / 2000) * 100);
              return (
                <div className="text-xs text-stone-600 px-0.5 font-medium">
                  Completion rate <span className="font-bold text-stone-900">{completionRate}%</span> (Average: {stats.averageWaterMl} ml / Target: 2000 ml)
                </div>
              );
            })()}

            {/* AI Coaching Advice */}
            {showWaterInsights && (
              <div className="rounded-lg border border-indigo-100/60 bg-indigo-50/20 p-2 text-xs">
                <p className="text-stone-700 leading-relaxed text-[11px]">
                  {waterAnalysis.insights} {waterAnalysis.recommendation}
                </p>
              </div>
            )}
          </div>
        )}

        <div className="border-t border-stone-200/60" />

        {/* SECTION D: Nutrient Ratios (Macronutrients) */}
        {macroAnalysis && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <PieChart size={15} className="text-emerald-500 shrink-0" />
                <span className="text-xs font-bold text-stone-800">Nutrient Ratios</span>
              </div>
              <span className="px-2 py-0.5 text-[9px] font-bold border border-stone-200 bg-white text-stone-600 rounded-full leading-none">
                {macroAnalysis.assessment}
              </span>
            </div>

            {/* Split Stacked Bar Chart */}
            <div className="space-y-1.5">
              <div className="h-2 w-full bg-stone-200/80 rounded-full overflow-hidden flex border border-stone-200/20">
                <div className="h-full bg-amber-300 transition-all duration-500" style={{ width: `${macroMetrics.carbsPct}%` }} />
                <div className="h-full bg-stone-400/80 transition-all duration-500" style={{ width: `${macroMetrics.fatPct}%` }} />
                <div className="h-full bg-indigo-500 transition-all duration-500" style={{ width: `${macroMetrics.proteinPct}%` }} />
              </div>
              
              <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-wider text-stone-400 mt-1 px-0.5">
                <div className="flex items-center gap-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-amber-300" />
                  <span>Carbs: {macroMetrics.carbsPct}%</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-stone-400/80" />
                  <span>Fat: {macroMetrics.fatPct}%</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                  <span>Protein: {macroMetrics.proteinPct}%</span>
                </div>
              </div>
            </div>

            {/* AI Coaching Advice */}
            {showMacroInsights && (
              <div className="rounded-lg border border-indigo-100/60 bg-indigo-50/20 p-2 text-xs">
                <p className="text-stone-700 leading-relaxed text-[11px]">
                  {macroAnalysis.insights} {macroAnalysis.recommendation}
                </p>
              </div>
            )}
          </div>
        )}

      </div>

    </div>
  );
}
