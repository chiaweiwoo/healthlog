"use client";

import { useMemo } from "react";
import {
  Calendar,
  AlertTriangle,
  Sparkles,
  Info,
  Flame,
  Dumbbell,
  Droplets,
  PieChart,
} from "lucide-react";
import {
  AnalysisStats,
  AnalysisEvidence,
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
  evidence: AnalysisEvidence;
  report: AIReportPayload | null;
  dailyHistory?: DailyHistoryItem[];
}) {
  const totalDaysInPeriod = 14;
  const isLowData = stats.completeDays < 7;

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
    const proteinAssessment = isProteinGood ? "Optimal Intake" : "Insufficient Intake";
    const proteinInsights = isProteinGood
      ? `Average protein intake is ${stats.averageProteinG}g, meeting or exceeding target levels for muscle preservation.`
      : `Average protein intake is ${stats.averageProteinG}g, which is below active target levels. Higher protein intake supports muscle synthesis and satiety.`;
    const proteinRecommendation = isProteinGood
      ? "Continue incorporating high-quality lean protein sources throughout your meals."
      : "Consider adding lean protein sources (e.g., egg whites, chicken breast, or tofu) to your main meals.";

    const isWaterGood = stats.averageWaterMl >= 2000;
    const waterAssessment = isWaterGood ? "Optimal Hydration" : "Moderate Dehydration";
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
    const macroAssessment = "Balanced Ratios";
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
    // Fill the pills from dailyHistory or default to false
    const pills = Array.from({ length: totalDaysInPeriod }).map((_, idx) => {
      if (idx < dailyHistory.length) {
        return dailyHistory[idx].isLogged;
      }
      return idx < stats.completeDays;
    });
    return pills;
  }, [dailyHistory, stats.completeDays]);

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 space-y-6">
      
      {/* 1. HEADER SECTION CARD */}
      <div className="rounded-xl border border-stone-200 bg-stone-50/60 p-4 shadow-sm space-y-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400">14-day rolling review</span>
            <h1 className="text-lg font-bold leading-tight text-stone-900 flex items-center gap-1.5">
              <Calendar size={18} className="text-stone-500" />
              {formatDate(stats.periodStart)} - {formatDate(stats.periodEnd)}
            </h1>
          </div>
          {report?.confidence && (
            <div className={cn(
              "flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-semibold",
              report.confidence === "high" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
              report.confidence === "medium" ? "bg-sky-50 text-sky-700 border-sky-200" :
              "bg-amber-50 text-amber-700 border-amber-200"
            )}>
              <Info size={12} />
              <span className="capitalize">{report.confidence} Confidence</span>
            </div>
          )}
        </div>

        {/* Tracking consistency pills progress indicator */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-stone-500">
            <span>Tracking Consistency</span>
            <span className="font-semibold text-stone-700">{stats.completeDays} of {totalDaysInPeriod} days logged</span>
          </div>
          
          <div className="flex gap-1">
            {consistencyPills.map((isLogged, index) => (
              <div
                key={index}
                className={cn(
                  "h-2.5 flex-1 rounded-full border border-stone-200/50 transition-colors duration-300",
                  isLogged 
                    ? isLowData 
                      ? "bg-amber-400" 
                      : "bg-emerald-500" 
                    : "bg-stone-200"
                )}
              />
            ))}
          </div>
        </div>

        {isLowData && (
          <div className="rounded-lg bg-amber-50/70 border border-amber-200/60 p-2.5 flex items-start gap-2 text-xs text-amber-800">
            <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-600" />
            <div>
              <p className="font-semibold">Limited Logging Coverage</p>
              <p className="mt-0.5 text-amber-700">
                You have logged under 7 days of entries in this 14-day window. AI recommendations and averages are preliminary. Log consistently to unlock high-confidence coaching insights.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* 2. CORE PERSPECTIVES Stack (Single-Column) */}

      {/* CARD 1: Calorie Outcomes & Balance */}
      {calorieAnalysis && (
        <div className="rounded-xl border border-stone-200 bg-stone-50/60 p-4 shadow-sm space-y-4">
          <SectionHeader
            icon={<Flame size={18} className="text-orange-500" />}
            caption="Energy Balance"
            title="Calorie Balance & Outcomes"
            iconBg="bg-orange-50"
          />

          <div className="space-y-3">
            {/* Deterministic Badges */}
            <div className="flex flex-col gap-2">
              <div className="flex justify-between items-center bg-white border border-stone-200/60 rounded-lg p-2.5 text-xs">
                <span className="font-medium text-stone-500 uppercase tracking-wider text-[9px]">Avg Daily Intake</span>
                <span className="font-bold text-stone-800 text-sm">{stats.averageIntakeCalories} kcal</span>
              </div>
              <div className="flex justify-between items-center bg-white border border-stone-200/60 rounded-lg p-2.5 text-xs">
                <span className="font-medium text-stone-500 uppercase tracking-wider text-[9px]">Avg Daily Quota (TDEE)</span>
                <span className="font-bold text-stone-800 text-sm">
                  {stats.averageQuotaCalories ? `${stats.averageQuotaCalories} kcal` : "N/A"}
                </span>
              </div>
              <div className="flex justify-between items-center bg-white border border-stone-200/60 rounded-lg p-2.5 text-xs">
                <span className="font-medium text-stone-500 uppercase tracking-wider text-[9px]">Avg Daily Net</span>
                {stats.averageNetCalories !== null ? (
                  <span className={cn(
                    "font-bold text-sm",
                    stats.averageNetCalories <= 0 ? "text-emerald-600" : "text-amber-600"
                  )}>
                    {stats.averageNetCalories <= 0 ? "" : "+"}
                    {stats.averageNetCalories <= 0 ? `${Math.abs(stats.averageNetCalories)} kcal Deficit` : `${stats.averageNetCalories} kcal Surplus`}
                  </span>
                ) : (
                  <span className="text-stone-400">Incomplete</span>
                )}
              </div>
            </div>

            {/* Quota Progress Bar */}
            {stats.averageQuotaCalories !== null && (
              <div className="space-y-1">
                <div className="flex justify-between text-[10px] font-bold uppercase tracking-wider text-stone-400">
                  <span>Quota Usage Target</span>
                  <span>{Math.round((stats.averageIntakeCalories / stats.averageQuotaCalories) * 100)}%</span>
                </div>
                <div className="h-2 w-full bg-stone-200 rounded-full overflow-hidden border border-stone-200/50">
                  <div
                    className={cn(
                      "h-full transition-all duration-500",
                      stats.averageIntakeCalories <= stats.averageQuotaCalories 
                        ? "bg-emerald-500" 
                        : "bg-amber-400"
                    )}
                    style={{ width: `${Math.min((stats.averageIntakeCalories / stats.averageQuotaCalories) * 100, 100)}%` }}
                  />
                </div>
              </div>
            )}

            {/* AI Insights and Alerts */}
            <div className="rounded-lg border border-indigo-100/60 bg-indigo-50/20 p-3 space-y-2.5">
              <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-900">
                <Sparkles size={14} className={cn("text-indigo-600", !report && "animate-pulse")} />
                <span>AI Health Analysis</span>
              </div>
              <p className="text-xs text-stone-700 leading-relaxed">
                {calorieAnalysis.insights}
              </p>
              
              {calorieAnalysis.alerts && calorieAnalysis.alerts.length > 0 && (
                <div className="space-y-1 pt-1">
                  <span className="text-[10px] uppercase font-bold text-amber-700 tracking-wider">Calorie Alerts</span>
                  <ul className="space-y-1 pl-1">
                    {calorieAnalysis.alerts.map((alert, idx) => (
                      <li key={idx} className="flex gap-1.5 text-[11px] text-amber-800 leading-normal items-start">
                        <AlertTriangle size={12} className="mt-0.5 shrink-0 text-amber-600" />
                        <span>{alert}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="border-t border-indigo-100/40 pt-2 text-xs text-stone-600">
                <span className="font-bold text-indigo-950">Recommendation:</span> {calorieAnalysis.recommendation}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CARD 2: Protein Intake & Alerts */}
      {proteinAnalysis && (
        <div className="rounded-xl border border-stone-200 bg-stone-50/60 p-4 shadow-sm space-y-4">
          <SectionHeader
            icon={<Dumbbell size={18} className="text-stone-600" />}
            caption="Intake Composition"
            title="Protein Intake & Quality"
            iconBg="bg-stone-100"
          />

          <div className="space-y-3">
            {/* Deterministic Badges */}
            <div className="flex flex-col gap-2">
              <div className="flex justify-between items-center bg-white border border-stone-200/60 rounded-lg p-2.5 text-xs">
                <span className="font-medium text-stone-500 uppercase tracking-wider text-[9px]">Avg Daily Protein</span>
                <span className="font-bold text-stone-800 text-sm">{stats.averageProteinG}g</span>
              </div>
              <div className="flex justify-between items-center bg-white border border-stone-200/60 rounded-lg p-2.5 text-xs">
                <span className="font-medium text-stone-500 uppercase tracking-wider text-[9px]">Energy Contribution</span>
                <span className="font-bold text-stone-800 text-sm">
                  {stats.averageIntakeCalories > 0 
                    ? `${Math.round(((stats.averageProteinG * 4) / stats.averageIntakeCalories) * 100)}%` 
                    : "N/A"}
                </span>
              </div>
            </div>

            {/* Protein Target Bar */}
            <div className="space-y-1">
              <div className="flex justify-between text-[10px] font-bold uppercase tracking-wider text-stone-400">
                <span>Muscle Retention Target</span>
                <span>{Math.round(Math.min((stats.averageProteinG / 100) * 100, 100))}%</span>
              </div>
              <div className="h-2 w-full bg-stone-200 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-stone-300 rounded-full" 
                  style={{ width: `${Math.min((stats.averageProteinG / 100) * 100, 100)}%` }} 
                />
              </div>
            </div>

            {/* AI Insights & Alerts */}
            <div className="rounded-lg border border-indigo-100/60 bg-indigo-50/20 p-3 space-y-2.5">
              <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-900">
                <Sparkles size={14} className={cn("text-indigo-600", !report && "animate-pulse")} />
                <span>AI Health Analysis</span>
              </div>
              <p className="text-xs text-stone-700 leading-relaxed">
                {proteinAnalysis.insights}
              </p>

              {proteinAnalysis.alerts && proteinAnalysis.alerts.length > 0 && (
                <div className="space-y-1 pt-1">
                  <span className="text-[10px] uppercase font-bold text-amber-700 tracking-wider">Protein Alerts</span>
                  <ul className="space-y-1 pl-1">
                    {proteinAnalysis.alerts.map((alert, idx) => (
                      <li key={idx} className="flex gap-1.5 text-[11px] text-amber-800 leading-normal items-start">
                        <AlertTriangle size={12} className="mt-0.5 shrink-0 text-amber-600" />
                        <span>{alert}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="border-t border-indigo-100/40 pt-2 text-xs text-stone-600">
                <span className="font-bold text-indigo-950">Recommendation:</span> {proteinAnalysis.recommendation}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CARD 3: Hydration Status */}
      {waterAnalysis && (
        <div className="rounded-xl border border-stone-200 bg-stone-50/60 p-4 shadow-sm space-y-4">
          <SectionHeader
            icon={<Droplets size={18} className="text-sky-500" />}
            caption="Hydration Balance"
            title="Water Intake & Hydration"
            iconBg="bg-sky-50"
          />

          <div className="space-y-3">
            {/* Deterministic Badges */}
            <div className="flex flex-col gap-2">
              <div className="flex justify-between items-center bg-white border border-stone-200/60 rounded-lg p-2.5 text-xs">
                <span className="font-medium text-stone-500 uppercase tracking-wider text-[9px]">Avg Daily Fluids</span>
                <span className="font-bold text-stone-800 text-sm">{stats.averageWaterMl} ml</span>
              </div>
              <div className="flex justify-between items-center bg-white border border-stone-200/60 rounded-lg p-2.5 text-xs">
                <span className="font-medium text-stone-500 uppercase tracking-wider text-[9px]">Hydration Level</span>
                <span className={cn(
                  "font-bold text-sm",
                  stats.averageWaterMl >= 2000 ? "text-sky-600" :
                  stats.averageWaterMl >= 1000 ? "text-stone-600" :
                  "text-amber-600"
                )}>
                  {waterAnalysis.assessment}
                </span>
              </div>
            </div>

            {/* Hydration Bar */}
            <div className="space-y-1">
              <div className="flex justify-between text-[10px] font-bold uppercase tracking-wider text-stone-400">
                <span>Daily Hydration Goal</span>
                <span>{Math.round(Math.min((stats.averageWaterMl / 2000) * 100, 100))}%</span>
              </div>
              <div className="h-2 w-full bg-stone-200 rounded-full overflow-hidden border border-stone-200/50">
                <div
                  className="h-full bg-sky-500 transition-all duration-500"
                  style={{ width: `${Math.min((stats.averageWaterMl / 2000) * 100, 100)}%` }}
                />
              </div>
            </div>

            {/* AI Insights & Recommendation */}
            <div className="rounded-lg border border-indigo-100/60 bg-indigo-50/20 p-3 space-y-2.5">
              <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-900">
                <Sparkles size={14} className={cn("text-indigo-600", !report && "animate-pulse")} />
                <span>AI Health Analysis</span>
              </div>
              <p className="text-xs text-stone-700 leading-relaxed">
                {waterAnalysis.insights}
              </p>

              <div className="border-t border-indigo-100/40 pt-2 text-xs text-stone-600">
                <span className="font-bold text-indigo-950">Recommendation:</span> {waterAnalysis.recommendation}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CARD 4: Macronutrient Ratios */}
      {macroAnalysis && (
        <div className="rounded-xl border border-stone-200 bg-stone-50/60 p-4 shadow-sm space-y-4">
          <SectionHeader
            icon={<PieChart size={18} className="text-emerald-500" />}
            caption="Nutrient Ratio"
            title="Macronutrient Distribution"
            iconBg="bg-emerald-50"
          />

          <div className="space-y-3">
            {/* Ratios distribution row */}
            {(() => {
              const totalMacrosG = (stats.averageProteinG || 0) + (stats.averageFatG || 0) + (stats.averageCarbsG || 0) || 1;
              const proteinPct = Math.round(((stats.averageProteinG || 0) / totalMacrosG) * 100);
              const fatPct = Math.round(((stats.averageFatG || 0) / totalMacrosG) * 100);
              const carbsPct = Math.round(((stats.averageCarbsG || 0) / totalMacrosG) * 100);

              return (
                <div className="space-y-3">
                  <div className="flex flex-col gap-2">
                    <div className="flex justify-between items-center bg-white border border-stone-200/60 rounded-lg p-2.5 text-xs">
                      <span className="font-medium text-stone-500 uppercase tracking-wider text-[9px]">Protein ({stats.averageProteinG}g)</span>
                      <span className="font-bold text-stone-800 text-sm">{proteinPct}%</span>
                    </div>
                    <div className="flex justify-between items-center bg-white border border-stone-200/60 rounded-lg p-2.5 text-xs">
                      <span className="font-medium text-stone-500 uppercase tracking-wider text-[9px]">Fat ({stats.averageFatG}g)</span>
                      <span className="font-bold text-stone-800 text-sm">{fatPct}%</span>
                    </div>
                    <div className="flex justify-between items-center bg-white border border-stone-200/60 rounded-lg p-2.5 text-xs">
                      <span className="font-medium text-stone-500 uppercase tracking-wider text-[9px]">Carbs ({stats.averageCarbsG}g)</span>
                      <span className="font-bold text-stone-800 text-sm">{carbsPct}%</span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="space-y-0.5">
                      <div className="flex justify-between text-[8px] uppercase tracking-wider font-bold text-stone-400">
                        <span>Protein Share</span>
                      </div>
                      <div className="h-1.5 w-full bg-stone-200 rounded-full overflow-hidden">
                        <div className="h-full bg-stone-300" style={{ width: `${proteinPct}%` }} />
                      </div>
                    </div>
                    <div className="space-y-0.5">
                      <div className="flex justify-between text-[8px] uppercase tracking-wider font-bold text-stone-400">
                        <span>Fat Share</span>
                      </div>
                      <div className="h-1.5 w-full bg-stone-200 rounded-full overflow-hidden">
                        <div className="h-full bg-stone-300" style={{ width: `${fatPct}%` }} />
                      </div>
                    </div>
                    <div className="space-y-0.5">
                      <div className="flex justify-between text-[8px] uppercase tracking-wider font-bold text-stone-400">
                        <span>Carbs Share</span>
                      </div>
                      <div className="h-1.5 w-full bg-stone-200 rounded-full overflow-hidden">
                        <div className="h-full bg-stone-300" style={{ width: `${carbsPct}%` }} />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* AI Insights & Recommendation */}
            <div className="rounded-lg border border-indigo-100/60 bg-indigo-50/20 p-3 space-y-2.5">
              <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-900">
                <Sparkles size={14} className={cn("text-indigo-600", !report && "animate-pulse")} />
                <span>AI Health Analysis</span>
              </div>
              <p className="text-xs text-stone-700 leading-relaxed">
                {macroAnalysis.insights}
              </p>

              <div className="border-t border-indigo-100/40 pt-2 text-xs text-stone-600">
                <span className="font-bold text-indigo-950">Recommendation:</span> {macroAnalysis.recommendation}
              </div>
            </div>
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
