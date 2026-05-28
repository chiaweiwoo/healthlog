"use client";

import { useMemo } from "react";
import {
  Calendar,
  AlertTriangle,
  Sparkles,
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

      {/* 2. CORE PERSPECTIVES STACK (SINGLE-COLUMN, HIGHLY DENSE) */}

      {/* CARD 1: Calorie Outcomes & Balance */}
      {calorieAnalysis && (
        <div className="rounded-xl border border-stone-200 bg-stone-50/60 p-3.5 shadow-sm space-y-2.5">
          <SectionHeader
            icon={<Flame size={16} className="text-orange-500" />}
            caption="Energy Balance"
            title="Calorie Outcomes"
            iconBg="bg-orange-50"
            action={
              <span className={cn(
                "px-2 py-0.5 text-[10px] font-bold border rounded-full capitalize",
                calorieAnalysis.outcome === "deficit"
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                  : "bg-amber-50 text-amber-700 border-amber-200"
              )}>
                {calorieAnalysis.outcome === "deficit" ? "Deficit" : "Surplus"}
              </span>
            }
          />

          <div className="space-y-2">
            {/* Compressed Metrics Row */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-stone-600 px-0.5">
              <div>
                <span className="font-semibold text-stone-900">Intake:</span> {stats.averageIntakeCalories} kcal
              </div>
              <div className="h-3 w-[1px] bg-stone-200" />
              <div>
                <span className="font-semibold text-stone-900">TDEE Quota:</span> {stats.averageQuotaCalories || "N/A"} kcal
              </div>
              <div className="h-3 w-[1px] bg-stone-200" />
              <div>
                <span className="font-semibold text-stone-900">Net:</span>{" "}
                <span className={cn(
                  "font-bold",
                  stats.averageNetCalories !== null && stats.averageNetCalories <= 0 ? "text-emerald-600" : "text-amber-600"
                )}>
                  {stats.averageNetCalories !== null 
                    ? stats.averageNetCalories <= 0 
                      ? `-${Math.abs(stats.averageNetCalories)} Deficit` 
                      : `+${stats.averageNetCalories} Surplus`
                    : "N/A"}
                </span>
              </div>
            </div>

            {/* Quota Progress Bar (Thin line) */}
            {stats.averageQuotaCalories !== null && (
              <div className="h-1.5 w-full bg-stone-200 rounded-full overflow-hidden">
                <div
                  className={cn(
                    "h-full transition-all duration-500",
                    stats.averageIntakeCalories <= stats.averageQuotaCalories ? "bg-emerald-500" : "bg-amber-400"
                  )}
                  style={{ width: `${Math.min((stats.averageIntakeCalories / stats.averageQuotaCalories) * 100, 100)}%` }}
                />
              </div>
            )}

            {/* AI Insights and Alerts (Rendered only on Surplus or Warning alerts) */}
            {showCalorieInsights && (
              <div className="rounded-lg border border-indigo-100/60 bg-indigo-50/20 p-2.5 space-y-2 text-xs">
                <div className="flex items-center gap-1.5 font-bold text-indigo-900 leading-none">
                  <Sparkles size={12} className="text-indigo-600 shrink-0" />
                  <span>AI Coaching Advice</span>
                </div>
                
                <p className="text-stone-700 leading-relaxed text-[11.5px]">
                  {calorieAnalysis.insights} {calorieAnalysis.recommendation}
                </p>
                
                {calorieAnalysis.alerts && calorieAnalysis.alerts.length > 0 && (
                  <div className="space-y-1 pt-0.5 border-t border-indigo-100/30">
                    <ul className="space-y-1 pl-0.5">
                      {calorieAnalysis.alerts.map((alert, idx) => (
                        <li key={idx} className="flex gap-1.5 text-[11px] text-amber-800 items-start">
                          <AlertTriangle size={11} className="mt-0.5 shrink-0 text-amber-600" />
                          <span>{alert}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* CARD 2: Protein Intake */}
      {proteinAnalysis && (
        <div className="rounded-xl border border-stone-200 bg-stone-50/60 p-3.5 shadow-sm space-y-2.5">
          <SectionHeader
            icon={<Dumbbell size={16} className="text-stone-600" />}
            caption="Intake Composition"
            title="Protein Intake"
            iconBg="bg-stone-100"
            action={
              <span className={cn(
                "px-2 py-0.5 text-[10px] font-bold border rounded-full",
                isProteinGood
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                  : "bg-amber-50 text-amber-700 border-amber-200"
              )}>
                {isProteinGood ? "Optimal" : "Low Protein"}
              </span>
            }
          />

          <div className="space-y-2">
            {/* Compressed Metrics Row */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-stone-600 px-0.5">
              <div>
                <span className="font-semibold text-stone-900">Avg Protein:</span> {stats.averageProteinG}g
              </div>
              <div className="h-3 w-[1px] bg-stone-200" />
              <div>
                <span className="font-semibold text-stone-900">Energy Share:</span>{" "}
                {stats.averageIntakeCalories > 0 
                  ? `${Math.round(((stats.averageProteinG * 4) / stats.averageIntakeCalories) * 100)}%` 
                  : "N/A"}
              </div>
            </div>

            {/* Protein Target Bar */}
            <div className="h-1.5 w-full bg-stone-200 rounded-full overflow-hidden">
              <div 
                className="h-full bg-stone-300 rounded-full" 
                style={{ width: `${Math.min((stats.averageProteinG / 100) * 100, 100)}%` }} 
              />
            </div>

            {/* AI Insights & Alerts (Rendered only on low protein or warnings) */}
            {showProteinInsights && (
              <div className="rounded-lg border border-indigo-100/60 bg-indigo-50/20 p-2.5 space-y-2 text-xs">
                <div className="flex items-center gap-1.5 font-bold text-indigo-900 leading-none">
                  <Sparkles size={12} className="text-indigo-600 shrink-0" />
                  <span>AI Coaching Advice</span>
                </div>
                
                <p className="text-stone-700 leading-relaxed text-[11.5px]">
                  {proteinAnalysis.insights} {proteinAnalysis.recommendation}
                </p>

                {proteinAnalysis.alerts && proteinAnalysis.alerts.length > 0 && (
                  <div className="space-y-1 pt-0.5 border-t border-indigo-100/30">
                    <ul className="space-y-1 pl-0.5">
                      {proteinAnalysis.alerts.map((alert, idx) => (
                        <li key={idx} className="flex gap-1.5 text-[11px] text-amber-800 items-start">
                          <AlertTriangle size={11} className="mt-0.5 shrink-0 text-amber-600" />
                          <span>{alert}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* CARD 3: Hydration Status */}
      {waterAnalysis && (
        <div className="rounded-xl border border-stone-200 bg-stone-50/60 p-3.5 shadow-sm space-y-2.5">
          <SectionHeader
            icon={<Droplets size={16} className="text-sky-500" />}
            caption="Hydration Balance"
            title="Water Intake"
            iconBg="bg-sky-50"
            action={
              <span className={cn(
                "px-2 py-0.5 text-[10px] font-bold border rounded-full",
                waterAnalysis.isGood
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                  : "bg-amber-50 text-amber-700 border-amber-200"
              )}>
                {waterAnalysis.isGood ? "Sufficient" : "Dehydrated"}
              </span>
            }
          />

          <div className="space-y-2">
            {/* Compressed Metrics Row */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-stone-600 px-0.5">
              <div>
                <span className="font-semibold text-stone-900">Avg Fluids:</span> {stats.averageWaterMl} ml
              </div>
              <div className="h-3 w-[1px] bg-stone-200" />
              <div>
                <span className="font-semibold text-stone-900">Daily Target:</span> 2000 ml
              </div>
            </div>

            {/* Hydration Bar */}
            <div className="h-1.5 w-full bg-stone-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-sky-500 transition-all duration-500"
                style={{ width: `${Math.min((stats.averageWaterMl / 2000) * 100, 100)}%` }}
              />
            </div>

            {/* AI Insights & Recommendation (Hidden if hydration is sufficient) */}
            {showWaterInsights && (
              <div className="rounded-lg border border-indigo-100/60 bg-indigo-50/20 p-2.5 space-y-2 text-xs">
                <div className="flex items-center gap-1.5 font-bold text-indigo-900 leading-none">
                  <Sparkles size={12} className="text-indigo-600 shrink-0" />
                  <span>AI Coaching Advice</span>
                </div>
                
                <p className="text-stone-700 leading-relaxed text-[11.5px]">
                  {waterAnalysis.insights} {waterAnalysis.recommendation}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* CARD 4: Macronutrient Ratios */}
      {macroAnalysis && (
        <div className="rounded-xl border border-stone-200 bg-stone-50/60 p-3.5 shadow-sm space-y-2.5">
          <SectionHeader
            icon={<PieChart size={16} className="text-emerald-500" />}
            caption="Nutrient Ratio"
            title="Macronutrient Ratios"
            iconBg="bg-emerald-50"
            action={
              <span className="px-2 py-0.5 text-[10px] font-bold border border-stone-200 bg-white text-stone-600 rounded-full">
                {macroAnalysis.assessment}
              </span>
            }
          />

          <div className="space-y-2">
            {/* Compressed Metrics Row (All macros on a single clean line!) */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-stone-600 px-0.5">
              <div>
                <span className="font-semibold text-stone-900">Carbs:</span> {macroMetrics.carbsPct}% ({Math.round(stats.averageCarbsG)}g)
              </div>
              <div className="h-3 w-[1px] bg-stone-200" />
              <div>
                <span className="font-semibold text-stone-900">Fat:</span> {macroMetrics.fatPct}% ({Math.round(stats.averageFatG)}g)
              </div>
              <div className="h-3 w-[1px] bg-stone-200" />
              <div>
                <span className="font-semibold text-stone-900">Protein:</span> {macroMetrics.proteinPct}% ({Math.round(stats.averageProteinG)}g)
              </div>
            </div>

            {/* AI Insights & Recommendation (Hidden if balanced/healthy macros) */}
            {showMacroInsights && (
              <div className="rounded-lg border border-indigo-100/60 bg-indigo-50/20 p-2.5 space-y-2 text-xs">
                <div className="flex items-center gap-1.5 font-bold text-indigo-900 leading-none">
                  <Sparkles size={12} className="text-indigo-600 shrink-0" />
                  <span>AI Coaching Advice</span>
                </div>
                
                <p className="text-stone-700 leading-relaxed text-[11.5px]">
                  {macroAnalysis.insights} {macroAnalysis.recommendation}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
}

function SectionHeader({
  icon,
  caption,
  title,
  action,
  iconBg = "bg-stone-50",
}: {
  icon: React.ReactNode;
  caption: string;
  title: string;
  action?: React.ReactNode;
  iconBg?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <div className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-stone-200/60",
          iconBg
        )}>
          {icon}
        </div>
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400 leading-none">{caption}</span>
          <p className="text-sm font-bold leading-tight text-stone-900 mt-0.5">{title}</p>
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
