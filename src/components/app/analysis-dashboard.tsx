"use client";

import { useState } from "react";
import {
  Calendar,
  AlertTriangle,
  CheckCircle,
  TrendingUp,
  Target,
  Sparkles,
  Info,
  UserCheck,
  ChevronDown,
  ChevronUp,
  BarChart3,
  HelpCircle,
} from "lucide-react";
import { NutritionIcons, NUTRITION_CONFIG } from "@/components/app/nutrition-icons";
import {
  AnalysisStats,
  AnalysisEvidence,
  FocusArea,
  ProfileGap,
} from "@/lib/schemas";

type AIReportPayload = {
  summary: string;
  rootCauses: string[];
  focusAreas: FocusArea[];
  profileGaps: ProfileGap[];
  confidence: "low" | "medium" | "high";
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
  evidence,
  report,
  dailyHistory = [],
}: {
  stats: AnalysisStats;
  evidence: AnalysisEvidence;
  report: AIReportPayload | null;
  dailyHistory?: DailyHistoryItem[];
}) {
  const [activeTab, setActiveTab] = useState<"stats" | "ai">("stats");
  const [showEvidence, setShowEvidence] = useState(false);

  const totalDaysInPeriod = stats.periodStart && stats.periodEnd
    ? Math.round((new Date(stats.periodEnd).getTime() - new Date(stats.periodStart).getTime()) / (24 * 60 * 60 * 1000)) + 1
    : 7;

  const isLowData = stats.completeDays < Math.ceil(totalDaysInPeriod / 2);

  // Formatting dates
  const formatDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
    } catch {
      return dateStr;
    }
  };

  // Confidence styling for AI report
  const getConfidenceStyle = (level: "low" | "medium" | "high") => {
    switch (level) {
      case "high":
        return {
          bg: "bg-emerald-50 text-emerald-700 border-emerald-200",
          text: "High",
          icon: <CheckCircle size={14} className="text-emerald-600" />,
        };
      case "medium":
        return {
          bg: "bg-sky-50 text-sky-700 border-sky-200",
          text: "Medium",
          icon: <Info size={14} className="text-sky-600" />,
        };
      case "low":
      default:
        return {
          bg: "bg-amber-50 text-amber-700 border-amber-200",
          text: "Low Confidence",
          icon: <AlertTriangle size={14} className="text-amber-600" />,
        };
    }
  };

  const confidenceDetails = report ? getConfidenceStyle(report.confidence) : null;

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 space-y-6">
      
      {/* DAILY ENERGY & WATER TRENDS GRAPH */}
      <TrendCharts dailyHistory={dailyHistory} />

      {/* 1. HEADER SECTION CARD */}
      <div className="rounded-xl border border-stone-200 bg-stone-50/60 p-4 shadow-sm space-y-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400">{totalDaysInPeriod}-day review</span>
            <h1 className="text-lg font-bold leading-tight text-stone-900 flex items-center gap-1.5">
              <Calendar size={18} className="text-stone-500" />
              {formatDate(stats.periodStart)} - {formatDate(stats.periodEnd)}
            </h1>
          </div>
          {confidenceDetails && activeTab === "ai" && (
            <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-semibold ${confidenceDetails.bg}`}>
              {confidenceDetails.icon}
              <span>{confidenceDetails.text}</span>
            </div>
          )}
        </div>

        {/* Tracking consistency dots/bar */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-stone-500">
            <span>Tracking Consistency</span>
            <span className="font-semibold text-stone-700">{stats.completeDays} of {totalDaysInPeriod} days logged</span>
          </div>
          
          <div className="flex gap-1.5">
            {Array.from({ length: totalDaysInPeriod }).map((_, index) => {
              const isActive = index < stats.completeDays;
              return (
                <div
                  key={index}
                  className={`h-2.5 flex-1 rounded-full border border-stone-200/50 transition-colors duration-300 ${
                    isActive 
                      ? isLowData 
                        ? "bg-amber-400" 
                        : "bg-emerald-500" 
                      : "bg-stone-200"
                  }`}
                />
              );
            })}
          </div>
        </div>

        {isLowData && (
          <div className="rounded-lg bg-amber-50/70 border border-amber-200/60 p-2.5 flex items-start gap-2 text-xs text-amber-800">
            <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-600" />
            <div>
              <p className="font-semibold">Limited Logging (Under 4 Days)</p>
              <p className="mt-0.5 text-amber-700">
                Averages and trends are highly preliminary. Log consistently to unlock high-confidence insights.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* 2. PREMIUM TAB SWITCHER */}
      <div className="flex rounded-lg bg-stone-100 p-1 border border-stone-200">
        <button
          onClick={() => setActiveTab("stats")}
          className={`flex-1 flex items-center justify-center gap-2 py-1.5 rounded-md text-xs font-bold transition-all duration-200 ${
            activeTab === "stats"
              ? "bg-white text-stone-900 shadow-sm border border-stone-200/50"
              : "text-stone-500 hover:text-stone-900"
          }`}
        >
          <BarChart3 size={14} />
          <span>{totalDaysInPeriod}-Day Stats</span>
        </button>
        <button
          onClick={() => setActiveTab("ai")}
          className={`flex-1 flex items-center justify-center gap-2 py-1.5 rounded-md text-xs font-bold transition-all duration-200 ${
            activeTab === "ai"
              ? "bg-white text-stone-900 shadow-sm border border-stone-200/50"
              : "text-stone-500 hover:text-stone-900"
          }`}
        >
          <Sparkles size={14} className={report ? "text-indigo-600 animate-pulse" : "text-stone-400"} />
          <span>AI Insights</span>
        </button>
      </div>

      {/* 3. CONDITIONAL RENDERING BASED ON ACTIVE TAB */}
      {activeTab === "stats" ? (
        <div className="space-y-6">
          
          {/* ENERGY CARD */}
          <div className="rounded-xl border border-stone-200 bg-stone-50/60 p-4 shadow-sm space-y-4">
            <SectionHeader
              icon={NUTRITION_CONFIG.calories.icon({ size: 18, className: NUTRITION_CONFIG.calories.color })}
              caption="Energy Balance"
              title="Calorie Outcomes"
              iconBg={NUTRITION_CONFIG.calories.bg}
            />

            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="bg-stone-50 border border-stone-200/60 rounded-lg p-2.5">
                <span className="text-[10px] uppercase font-bold text-stone-400 tracking-wider">Avg Intake</span>
                <p className="text-sm font-bold text-stone-800 mt-1">{stats.averageIntakeCalories} <span className="text-xs font-normal text-stone-500">kcal</span></p>
              </div>
              <div className="bg-stone-50 border border-stone-200/60 rounded-lg p-2.5">
                <span className="text-[10px] uppercase font-bold text-stone-400 tracking-wider">Avg Quota (TDEE)</span>
                <p className="text-sm font-bold text-stone-800 mt-1">
                  {stats.averageQuotaCalories ? `${stats.averageQuotaCalories} kcal` : "N/A"}
                </p>
              </div>
              <div className="bg-stone-50 border border-stone-200/60 rounded-lg p-2.5">
                <span className="text-[10px] uppercase font-bold text-stone-400 tracking-wider">Avg Net</span>
                {stats.averageNetCalories !== null ? (
                  <p className={`text-sm font-bold mt-1 ${stats.averageNetCalories <= 0 ? "text-emerald-600" : "text-amber-600"}`}>
                    {stats.averageNetCalories <= 0 ? "" : "+"}
                    {stats.averageNetCalories} <span className="text-xs font-normal">kcal</span>
                  </p>
                ) : (
                  <p className="text-xs text-stone-400 mt-1">Incomplete</p>
                )}
              </div>
            </div>

            {/* Top-level energy comparison bar */}
            {stats.averageQuotaCalories !== null && (
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs font-medium text-stone-500">
                  <span>Quota Usage</span>
                  <span>{Math.round((stats.averageIntakeCalories / stats.averageQuotaCalories) * 100)}%</span>
                </div>
                <div className="h-3 w-full bg-stone-200 rounded-full overflow-hidden border border-stone-200/50">
                  <div
                    className={`h-full transition-all duration-500 ${
                      stats.averageIntakeCalories <= stats.averageQuotaCalories 
                        ? "bg-emerald-500" 
                        : "bg-amber-400"
                    }`}
                    style={{ width: `${Math.min((stats.averageIntakeCalories / stats.averageQuotaCalories) * 100, 100)}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* NUTRITION & MACROS CARD */}
          <div className="rounded-xl border border-stone-200 bg-stone-50/60 p-4 shadow-sm space-y-4">
            <SectionHeader
              icon={NUTRITION_CONFIG.proteinG.icon({ size: 18, className: NUTRITION_CONFIG.proteinG.color })}
              caption="Intake Composition"
              title="Macro Averages"
              iconBg={NUTRITION_CONFIG.proteinG.bg}
            />

            <div className="space-y-3">
              {/* Protein Row */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5 font-medium text-stone-700">
                    <span className={NUTRITION_CONFIG.proteinG.color}>
                      {NUTRITION_CONFIG.proteinG.icon({ size: 12 })}
                    </span>
                    Protein
                  </span>
                  <span className="font-bold text-stone-800">{stats.averageProteinG}g</span>
                </div>
                <div className="h-2 w-full bg-stone-200 rounded-full overflow-hidden">
                  <div className="h-full bg-stone-300 rounded-full" style={{ width: `${Math.min((stats.averageProteinG / 150) * 100, 100)}%` }} />
                </div>
              </div>

              {/* Fats Row */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5 font-medium text-stone-700">
                    <span className={NUTRITION_CONFIG.fatG.color}>
                      {NUTRITION_CONFIG.fatG.icon({ size: 12 })}
                    </span>
                    Fat
                  </span>
                  <span className="font-bold text-stone-800">{stats.averageFatG}g</span>
                </div>
                <div className="h-2 w-full bg-stone-200 rounded-full overflow-hidden">
                  <div className="h-full bg-stone-300 rounded-full" style={{ width: `${Math.min((stats.averageFatG / 80) * 100, 100)}%` }} />
                </div>
              </div>

              {/* Carbs Row */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5 font-medium text-stone-700">
                    <span className={NUTRITION_CONFIG.carbsG.color}>
                      {NUTRITION_CONFIG.carbsG.icon({ size: 12 })}
                    </span>
                    Carbs
                  </span>
                  <span className="font-bold text-stone-800">{stats.averageCarbsG}g</span>
                </div>
                <div className="h-2 w-full bg-stone-200 rounded-full overflow-hidden">
                  <div className="h-full bg-stone-300 rounded-full" style={{ width: `${Math.min((stats.averageCarbsG / 250) * 100, 100)}%` }} />
                </div>
              </div>

              {/* Alcohol Row */}
              {stats.averageAlcoholG > 0 && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5 font-medium text-stone-700">
                      <span className={NUTRITION_CONFIG.alcoholG.color}>
                        {NUTRITION_CONFIG.alcoholG.icon({ size: 12 })}
                      </span>
                      Alcohol
                    </span>
                    <span className="font-bold text-red-600">{stats.averageAlcoholG}g</span>
                  </div>
                  <div className="h-2 w-full bg-stone-200 rounded-full overflow-hidden">
                    <div className="h-full bg-red-400 rounded-full" style={{ width: `${Math.min((stats.averageAlcoholG / 50) * 100, 100)}%` }} />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* HYDRATION & WATER CARD */}
          <div className="rounded-xl border border-stone-200 bg-stone-50/60 p-4 shadow-sm space-y-4">
            <SectionHeader
              icon={NUTRITION_CONFIG.waterMl.icon({ size: 18, className: NUTRITION_CONFIG.waterMl.color })}
              caption="Hydration Balance"
              title="Hydration Intake"
              iconBg={NUTRITION_CONFIG.waterMl.bg}
            />

            <div className="flex items-center justify-between">
              <div>
                <span className="text-[10px] uppercase font-bold text-stone-400 tracking-wider">Avg Daily Water</span>
                <p className="text-sm font-bold text-stone-800 mt-0.5">{stats.averageWaterMl} <span className="text-xs font-normal text-stone-500">ml</span></p>
              </div>
              <div className="text-right">
                <span className="text-[10px] uppercase font-bold text-stone-400 tracking-wider">Averages Status</span>
                <p className="text-sm font-semibold text-stone-600 mt-0.5">
                  {stats.averageWaterMl >= 2000 ? "Optimal" : stats.averageWaterMl >= 1000 ? "Moderate" : "Dehydrated"}
                </p>
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="h-3 w-full bg-stone-200 rounded-full overflow-hidden border border-stone-200/50">
                <div
                  className="h-full bg-sky-500 transition-all duration-500"
                  style={{ width: `${Math.min((stats.averageWaterMl / 2500) * 100, 100)}%` }}
                />
              </div>
            </div>
          </div>

          {/* Collapsible nutrient & activity evidence */}
          <div className="rounded-xl border border-stone-200 bg-stone-50/60 p-3 shadow-sm">
            <button
              onClick={() => setShowEvidence(!showEvidence)}
              className="w-full flex items-center justify-between py-1 px-1.5 text-xs font-bold text-stone-600"
            >
              <span className="flex items-center gap-1.5">
                <Info size={14} className="text-stone-400" />
                Detailed Nutrient & Activity Evidence
              </span>
              {showEvidence ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>

            {showEvidence && (
              <div className="mt-3 border-t border-stone-200 pt-3 space-y-4 text-xs">
                {/* Top Calorie Foods */}
                <div className="space-y-1.5">
                  <p className="font-bold text-stone-800">Top Calorie Entries</p>
                  {evidence.topCalorieFoods && evidence.topCalorieFoods.length > 0 ? (
                    <div className="space-y-2">
                      {evidence.topCalorieFoods.map((item, idx) => (
                        <div key={idx} className="bg-white border border-stone-200/40 rounded p-2 space-y-1">
                          <div className="flex justify-between">
                            <span className="font-medium text-stone-700">{item.label}</span>
                            <span className="font-bold text-stone-600">{item.nutrition?.calories} kcal</span>
                          </div>
                          {item.nutrition && <NutritionIcons data={item.nutrition} />}
                          <p className="text-[10px] text-stone-400 italic">{item.remarks}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-stone-400 italic">No food entries available.</p>
                  )}
                </div>

                {/* High-Calorie/Low-Protein Candidates */}
                {evidence.highCalorieLowProteinCandidates && evidence.highCalorieLowProteinCandidates.length > 0 && (
                  <div className="space-y-1.5 pt-2">
                    <p className="font-bold text-amber-700">Empty-Calorie Candidates (&gt;300 kcal, &lt;10g Protein)</p>
                    <div className="space-y-2">
                      {evidence.highCalorieLowProteinCandidates.map((item, idx) => (
                        <div key={idx} className="bg-amber-50/30 border border-amber-200/40 rounded p-2 space-y-1">
                          <div className="flex justify-between">
                            <span className="font-medium text-stone-700">{item.label}</span>
                            <span className="font-bold text-amber-700">{item.nutrition?.calories} kcal</span>
                          </div>
                          {item.nutrition && <NutritionIcons data={item.nutrition} />}
                          <p className="text-[10px] text-stone-400 italic">{item.remarks}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Alcohol contributors */}
                {evidence.alcoholContributors && evidence.alcoholContributors.length > 0 && (
                  <div className="space-y-1.5 pt-2">
                    <p className="font-bold text-stone-800">Alcohol Contributors</p>
                    <div className="space-y-2">
                      {evidence.alcoholContributors.map((item, idx) => (
                        <div key={idx} className="bg-white border border-stone-200/40 rounded p-2 space-y-1">
                          <div className="flex justify-between">
                            <span className="font-medium text-stone-700">{item.label}</span>
                            <span className="font-bold text-purple-600">{item.nutrition?.alcoholG}g alc</span>
                          </div>
                          {item.nutrition && <NutritionIcons data={item.nutrition} />}
                          <p className="text-[10px] text-stone-400 italic">{item.remarks}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Exercise contributors */}
                {evidence.exerciseContributors && evidence.exerciseContributors.length > 0 && (
                  <div className="space-y-1.5 pt-2">
                    <p className="font-bold text-stone-800">Exercise Events</p>
                    <div className="space-y-2">
                      {evidence.exerciseContributors.map((item, idx) => (
                        <div key={idx} className="bg-white border border-stone-200/40 rounded p-2 space-y-1">
                          <div className="flex justify-between">
                            <span className="font-medium text-stone-700">{item.label}</span>
                            <span className="font-bold text-emerald-600">-{item.exerciseCalories} kcal</span>
                          </div>
                          <p className="text-[10px] text-stone-400 italic">{item.remarks}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Water contributors */}
                {evidence.waterContributors && evidence.waterContributors.length > 0 && (
                  <div className="space-y-1.5 pt-2">
                    <p className="font-bold text-stone-800">Water/Liquid Inputs</p>
                    <div className="space-y-2">
                      {evidence.waterContributors.map((item, idx) => (
                        <div key={idx} className="bg-white border border-stone-200/40 rounded p-2 space-y-1">
                          <div className="flex justify-between">
                            <span className="font-medium text-stone-700">{item.label}</span>
                            <span className="font-bold text-sky-600">+{item.waterMl} ml</span>
                          </div>
                          <p className="text-[10px] text-stone-400 italic">{item.remarks}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

              </div>
            )}
          </div>

        </div>
      ) : (
        <div className="space-y-4">
          
          {report ? (
            <div className="space-y-4">
              
              {/* SUMMARY & DRIVERS */}
              <div className="rounded-xl border border-stone-200 bg-stone-50/60 p-4 shadow-sm space-y-4">
                <SectionHeader
                  icon={<Sparkles size={18} className="text-emerald-600 animate-pulse" />}
                  caption="AI Interpretation"
                  title="Weekly Summary"
                  iconBg="bg-emerald-50"
                />

                <div className="text-sm text-stone-700 leading-relaxed bg-white border border-stone-200/60 rounded-lg p-3 shadow-inner">
                  {report.summary || "No summary provided by Gemini."}
                </div>

                <div className="space-y-2.5">
                  <p className="text-xs font-bold uppercase tracking-wider text-stone-400">What Drove This Week</p>
                  {report.rootCauses && report.rootCauses.length > 0 ? (
                    <ul className="space-y-2">
                      {report.rootCauses.map((cause, idx) => (
                        <li key={idx} className="flex gap-2 text-xs text-stone-600 leading-relaxed items-start">
                          <TrendingUp size={14} className="mt-0.5 text-stone-400 shrink-0" />
                          <span>{cause}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-stone-400 italic">No root causes identified.</p>
                  )}
                </div>
              </div>

              {/* FOCUS AREAS */}
              <div className="rounded-xl border border-stone-200 bg-stone-50/60 p-4 shadow-sm space-y-4">
                <SectionHeader
                  icon={<Target size={18} className="text-sky-600" />}
                  caption="Action Plan"
                  title="Where to Focus Next"
                  iconBg="bg-sky-50"
                />

                <div className="space-y-3">
                  {report.focusAreas && report.focusAreas.length > 0 ? (
                    report.focusAreas.map((area, idx) => (
                      <div key={idx} className="bg-white border border-stone-200/60 rounded-lg p-3 space-y-1">
                        <p className="text-xs font-bold text-stone-900 flex items-center gap-1.5">
                          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-sky-50 text-[10px] text-sky-600 font-bold border border-sky-200/60">
                            {idx + 1}
                          </span>
                          {area.action}
                        </p>
                        <p className="text-xs text-stone-500 leading-relaxed pl-5">{area.rationale}</p>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-stone-400 italic">No specific actions compiled.</p>
                  )}
                </div>
              </div>

              {/* PROFILE GAPS */}
              {report.profileGaps && report.profileGaps.length > 0 && (
                <div className="rounded-xl border border-stone-200 bg-stone-50/60 p-4 shadow-sm space-y-4">
                  <SectionHeader
                    icon={<UserCheck size={18} className="text-stone-600" />}
                    caption="Diagnostics"
                    title="Profile Gaps"
                    iconBg="bg-stone-100"
                  />

                  <div className="space-y-3">
                    {report.profileGaps.map((gap, idx) => (
                      <div key={idx} className="rounded-lg border border-amber-200 bg-amber-50/40 p-3 space-y-2">
                        <div className="flex items-start gap-2">
                          <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-600" />
                          <div>
                            <p className="text-xs font-bold text-stone-900">Missing Information: {gap.parameter}</p>
                            <p className="mt-0.5 text-xs text-stone-600 leading-relaxed">{gap.whyItMatters}</p>
                          </div>
                        </div>
                        <div className="pl-6 border-t border-amber-200/50 pt-2 text-xs text-stone-500 italic">
                          <span className="font-semibold text-stone-600">Action:</span> {gap.improveAdvice}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            </div>
          ) : (
            /* DYNAMIC HIGH-FIDELITY PENDING CARD */
            <div className="text-center py-12 px-6 rounded-xl border border-stone-200 bg-stone-50/60 shadow-sm space-y-4">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg border border-stone-200 bg-white text-indigo-500 shadow-sm">
                <Sparkles size={24} className="animate-pulse" />
              </div>
              <div className="max-w-md mx-auto space-y-2">
                <h2 className="text-base font-bold text-stone-900">{totalDaysInPeriod}-Day AI Insights Pending</h2>
                <p className="text-xs text-stone-500 leading-relaxed">
                  Your {totalDaysInPeriod}-day nutritional and behavioral reviews are generated via a manual analysis pipeline.
                  Once the GitHub Actions workflow triggers, your latest insights, root causes, and focus areas will automatically appear in this tab.
                </p>
              </div>
              <div className="pt-2">
                <div className="inline-flex items-center gap-1.5 rounded-full bg-stone-100 border border-stone-200 px-3 py-1 text-[10px] font-medium text-stone-600">
                  <HelpCircle size={12} className="text-stone-400" />
                  <span>Trigger &quot;Analyze {totalDaysInPeriod}-day HealthLog&quot; via GitHub Actions</span>
                </div>
              </div>
            </div>
          )}

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
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-stone-200/60 ${iconBg}`}>
          {icon}
        </div>
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400">{caption}</span>
          <p className="text-sm font-bold leading-tight text-stone-900">{title}</p>
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

function TrendCharts({ dailyHistory }: { dailyHistory: DailyHistoryItem[] }) {
  if (!dailyHistory || dailyHistory.length === 0) return null;

  // TDEE quota averages calculation across logged days (days with active summaries)
  const loggedDays = dailyHistory.filter((d) => d.isLogged);
  const useFallbackOnly = loggedDays.length === 0;
  const sourceDays = useFallbackOnly ? dailyHistory : loggedDays;
  const count = sourceDays.length;

  const totalBmr = sourceDays.reduce((acc, d) => acc + d.bmr, 0);
  const totalNeat = sourceDays.reduce((acc, d) => acc + Math.max(0, d.baseTdee - d.bmr), 0);
  const totalTef = sourceDays.reduce((acc, d) => acc + d.tefCalories, 0);
  const totalEat = sourceDays.reduce((acc, d) => acc + d.exerciseCalories, 0);
  const totalTdee = sourceDays.reduce((acc, d) => acc + d.tdee, 0);

  const avgBmr = Math.round(totalBmr / count);
  const avgNeat = Math.round(totalNeat / count);
  const avgTef = Math.round(totalTef / count);
  const avgEat = Math.round(totalEat / count);
  const avgTdee = Math.round(totalTdee / count);

  const pctBmr = avgTdee > 0 ? (avgBmr / avgTdee) * 100 : 0;
  const pctNeat = avgTdee > 0 ? (avgNeat / avgTdee) * 100 : 0;
  const pctTef = avgTdee > 0 ? (avgTef / avgTdee) * 100 : 0;
  const pctEat = avgTdee > 0 ? (avgEat / avgTdee) * 100 : 0;

  const formatPct = (pct: number) => Math.round(pct * 10) / 10;

  const formatXAxisDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString("en-US", { weekday: "short", day: "numeric", timeZone: "UTC" });
    } catch {
      return dateStr;
    }
  };

  const w = 500;
  const h = 220;
  const marginL = 50;
  const marginR = 20;
  const marginT = 20;
  const marginB = 40;

  const chartH = h - marginT - marginB;
  const baselineY = h - marginB;

  const maxHistoryCal = Math.max(
    ...dailyHistory.map((d) => Math.max(d.tdee || 0, d.calories || 0)),
    2500
  );
  const maxCalAxis = Math.ceil(maxHistoryCal / 500) * 500;
  const calScale = chartH / maxCalAxis;

  const calGridValues = [500, 1000, 1500, 2000, 2500, 3000, 3500, 4000].filter((v) => v < maxCalAxis);

  const maxHistoryWater = Math.max(
    ...dailyHistory.map((d) => Math.max(d.waterMl || 0, d.waterTarget || 0)),
    2000
  );
  const maxWaterAxis = Math.ceil(maxHistoryWater / 500) * 500;
  const waterScale = chartH / maxWaterAxis;

  const waterGridValues = [500, 1000, 1500, 2000, 2500, 3000, 3500, 4000, 5000].filter((v) => v < maxWaterAxis);

  const colW = 32;
  const colGap = 28;
  const startX = marginL + 19;

  const hasAlcohol = dailyHistory.some((d) => d.alcoholG > 0);

  return (
    <div className="rounded-xl border border-stone-200 bg-stone-50/60 p-4 shadow-sm space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-stone-200/60 bg-indigo-50">
            <BarChart3 className="text-indigo-500" size={18} />
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400">Weekly Overview</span>
            <p className="text-sm font-bold leading-tight text-stone-900">Energy & Hydration Trends</p>
          </div>
        </div>
      </div>

      <div className="space-y-8">
        {/* TDEE Quota Breakdown Card with Simple Pie Chart */}
        <div className="bg-white border border-stone-200/60 rounded-lg p-4 shadow-inner space-y-4">
          <div className="flex items-center justify-between text-xs font-bold text-stone-700 pb-1 border-b border-stone-100">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded bg-zinc-700" />
              TDEE Quota (Average Allocation)
            </span>
            <span className="text-stone-400 font-normal">
              {useFallbackOnly ? "Profile Default Target" : `Avg over ${loggedDays.length} logged day${loggedDays.length === 1 ? "" : "s"}`}
            </span>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-6 py-2">
            {/* Left: Simple Pie Chart */}
            <div className="relative w-32 h-32 flex-shrink-0 flex items-center justify-center">
              <svg viewBox="0 0 100 100" className="w-full h-full font-sans select-none overflow-visible">
                <circle cx="50" cy="50" r="25" fill="none" stroke="#f5f5f4" strokeWidth="50" />
                
                {pctBmr > 0 && (
                  <circle
                    cx="50"
                    cy="50"
                    r="25"
                    fill="none"
                    stroke="#3f3f46"
                    strokeWidth="50"
                    strokeDasharray="157.08"
                    strokeDashoffset={157.08 - (pctBmr / 100) * 157.08}
                    transform="rotate(-90 50 50)"
                  />
                )}
                {pctNeat > 0 && (
                  <circle
                    cx="50"
                    cy="50"
                    r="25"
                    fill="none"
                    stroke="#94a3b8"
                    strokeWidth="50"
                    strokeDasharray="157.08"
                    strokeDashoffset={157.08 - (pctNeat / 100) * 157.08}
                    transform={`rotate(${-90 + (pctBmr / 100) * 360} 50 50)`}
                  />
                )}
                {pctTef > 0 && (
                  <circle
                    cx="50"
                    cy="50"
                    r="25"
                    fill="none"
                    stroke="#fcd34d"
                    strokeWidth="50"
                    strokeDasharray="157.08"
                    strokeDashoffset={157.08 - (pctTef / 100) * 157.08}
                    transform={`rotate(${-90 + ((pctBmr + pctNeat) / 100) * 360} 50 50)`}
                  />
                )}
                {pctEat > 0 && (
                  <circle
                    cx="50"
                    cy="50"
                    r="25"
                    fill="none"
                    stroke="#10b981"
                    strokeWidth="50"
                    strokeDasharray="157.08"
                    strokeDashoffset={157.08 - (pctEat / 100) * 157.08}
                    transform={`rotate(${-90 + ((pctBmr + pctNeat + pctTef) / 100) * 360} 50 50)`}
                  />
                )}
              </svg>
            </div>

            {/* Right: Legend & Metrics List */}
            <div className="flex-1 w-full space-y-2">
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="flex items-center gap-2 p-1.5 rounded-lg bg-stone-50 border border-stone-200/40">
                  <span className="h-2.5 w-2.5 rounded-full bg-zinc-700 shrink-0" />
                  <div className="text-left leading-none">
                    <p className="font-bold text-stone-700">{avgBmr} kcal</p>
                    <span className="text-[9px] text-stone-400 font-semibold">BMR ({formatPct(pctBmr)}%)</span>
                  </div>
                </div>
                
                <div className="flex items-center gap-2 p-1.5 rounded-lg bg-stone-50 border border-stone-200/40">
                  <span className="h-2.5 w-2.5 rounded-full bg-slate-400 shrink-0" />
                  <div className="text-left leading-none">
                    <p className="font-bold text-stone-600">{avgNeat} kcal</p>
                    <span className="text-[9px] text-stone-400 font-semibold">NEAT ({formatPct(pctNeat)}%)</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 p-1.5 rounded-lg bg-stone-50 border border-stone-200/40">
                  <span className="h-2.5 w-2.5 rounded-full bg-amber-300 shrink-0" />
                  <div className="text-left leading-none">
                    <p className="font-bold text-amber-600">{avgTef} kcal</p>
                    <span className="text-[9px] text-stone-400 font-semibold">TEF ({formatPct(pctTef)}%)</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 p-1.5 rounded-lg bg-stone-50 border border-stone-200/40">
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 shrink-0" />
                  <div className="text-left leading-none">
                    <p className="font-bold text-emerald-600">{avgEat} kcal</p>
                    <span className="text-[9px] text-stone-400 font-semibold">EAT ({formatPct(pctEat)}%)</span>
                  </div>
                </div>
              </div>

              <div className="flex justify-between items-center text-xs font-bold text-stone-700 bg-stone-50/80 border border-stone-200/60 rounded-lg p-2 mt-2">
                <span>Total TDEE (Daily Quota)</span>
                <span className="text-stone-900 font-extrabold">{avgTdee} kcal</span>
              </div>
            </div>
          </div>
        </div>

        {/* CHART 2: Calories Intake Stacked Bar Chart */}
        <div className="bg-white border border-stone-200/60 rounded-lg p-3 shadow-inner space-y-3">
          <div className="flex items-center justify-between text-xs font-bold text-stone-700 pb-1 border-b border-stone-100">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-indigo-400" />
              Daily Calorie Intake vs. TDEE
            </span>
            <span className="text-stone-400 font-normal">Realized Intake</span>
          </div>

          <div className="relative w-full aspect-[500/220]">
            <svg viewBox="0 0 500 220" className="w-full h-full font-sans select-none overflow-visible">
              {calGridValues.map((val) => {
                const y = baselineY - val * calScale;
                return (
                  <g key={val}>
                    <line x1={marginL} y1={y} x2={w - marginR} y2={y} stroke="#f1f5f9" strokeWidth="1" strokeDasharray="3,3" />
                    <text x={marginL - 8} y={y + 3.5} textAnchor="end" className="fill-stone-400 font-medium text-[9px]">{val}</text>
                  </g>
                );
              })}
              
              <line x1={marginL} y1={baselineY} x2={w - marginR} y2={baselineY} stroke="#e2e8f0" strokeWidth="1.5" />
              <text x={marginL - 8} y={baselineY + 3.5} textAnchor="end" className="fill-stone-400 font-semibold text-[9px]">0 kcal</text>

              {dailyHistory.map((day, idx) => {
                const x = startX + idx * (colW + colGap);
                
                const protCal = day.proteinG * 4;
                const fatCal = day.fatG * 9;
                const carbCal = day.carbsG * 4;
                const alcCal = day.alcoholG * 7;
                
                const stackedSum = protCal + fatCal + carbCal + alcCal;
                const otherCal = Math.max(0, day.calories - stackedSum);

                const hProt = protCal * calScale;
                const hFat = fatCal * calScale;
                const hCarb = carbCal * calScale;
                const hAlc = alcCal * calScale;
                const hOth = otherCal * calScale;
                const totalIntakeHeight = hProt + hFat + hCarb + hAlc + hOth;

                const yProt = baselineY - hProt;
                const yFat = yProt - hFat;
                const yCarb = yFat - hCarb;
                const yAlc = yCarb - hAlc;
                const yOth = yAlc - hOth;

                const yIntakeTop = baselineY - totalIntakeHeight;
                const yTdee = baselineY - day.tdee * calScale;

                const dateStr = formatXAxisDate(day.date);
                const netCal = day.calories - day.tdee;
                const hasNotes = day.calories > 0;

                return (
                  <g key={day.date} className="group">
                    {hProt > 0 && (
                      <rect x={x} y={yProt} width={colW} height={hProt} fill="#818cf8" className="transition-all duration-200 group-hover:opacity-90" />
                    )}
                    {hFat > 0 && (
                      <rect x={x} y={yFat} width={colW} height={hFat} fill="#10b981" className="transition-all duration-200 group-hover:opacity-90" />
                    )}
                    {hCarb > 0 && (
                      <rect x={x} y={yCarb} width={colW} height={hCarb} fill="#fb923c" className="transition-all duration-200 group-hover:opacity-90" />
                    )}
                    {hAlc > 0 && (
                      <rect x={x} y={yAlc} width={colW} height={hAlc} fill="#c084fc" className="transition-all duration-200 group-hover:opacity-90" />
                    )}
                    {hOth > 0 && (
                      <rect x={x} y={yOth} width={colW} height={hOth} fill="#d6d3d1" className="transition-all duration-200 group-hover:opacity-90" />
                    )}

                    {hasNotes && day.calories < day.tdee && (
                      <rect
                        x={x}
                        y={yTdee}
                        width={colW}
                        height={yIntakeTop - yTdee}
                        fill="rgba(16, 185, 129, 0.03)"
                        stroke="#10b981"
                        strokeWidth="1.2"
                        strokeDasharray="2,2"
                        className="pointer-events-none"
                      />
                    )}

                    {hasNotes && day.calories > day.tdee && (
                      <rect
                        x={x}
                        y={yIntakeTop}
                        width={colW}
                        height={yTdee - yIntakeTop}
                        fill="rgba(245, 158, 11, 0.05)"
                        stroke="#f59e0b"
                        strokeWidth="1.5"
                        className="pointer-events-none"
                      />
                    )}

                    <line
                      x1={x - 4}
                      y1={yTdee}
                      x2={x + colW + 4}
                      y2={yTdee}
                      stroke="#f59e0b"
                      strokeWidth="2"
                      strokeDasharray="2,1"
                      className="drop-shadow-sm"
                    />

                    {day.calories > 0 && (
                      <text x={x + colW / 2} y={yIntakeTop - 6} textAnchor="middle" className="fill-stone-800 font-bold text-[9px]">{Math.round(day.calories)}</text>
                    )}

                    {hasNotes ? (
                      netCal <= 0 ? (
                        <text x={x + colW / 2} y={baselineY + 12} textAnchor="middle" className="fill-emerald-600 font-bold text-[8.5px]">
                          ↓{Math.abs(Math.round(netCal))}
                        </text>
                      ) : (
                        <text x={x + colW / 2} y={baselineY + 12} textAnchor="middle" className="fill-amber-600 font-bold text-[8.5px]">
                          ↑+{Math.round(netCal)}
                        </text>
                      )
                    ) : (
                      <text x={x + colW / 2} y={baselineY + 12} textAnchor="middle" className="fill-stone-300 text-[8.5px] font-medium">-</text>
                    )}

                    <text x={x + colW / 2} y={baselineY + 23} textAnchor="middle" className="fill-stone-500 font-semibold text-[9px]">{dateStr.split(" ")[0]}</text>
                    <text x={x + colW / 2} y={baselineY + 34} textAnchor="middle" className="fill-stone-400 text-[8px]">{dateStr.split(" ")[1]}</text>
                  </g>
                );
              })}
            </svg>
          </div>

          <div className="flex flex-wrap gap-x-3.5 gap-y-1.5 justify-center pt-2.5 text-[9px] text-stone-500 font-semibold border-t border-stone-100">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded bg-indigo-400" /> Protein (🥚)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded bg-emerald-500" /> Fats (🥑)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded bg-orange-400" /> Carbs (🍞)
            </span>
            {hasAlcohol && (
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded bg-purple-400" /> Alcohol (🍷)
              </span>
            )}
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded bg-stone-300" /> Other
            </span>
            <span className="flex items-center gap-1 pl-2 border-l border-stone-200">
              <span className="h-0.5 w-3 bg-yellow-500 border-t border-dashed border-yellow-500" /> Quota TDEE Target
            </span>
            <span className="flex items-center gap-1 pl-2 border-l border-stone-200">
              <span className="text-emerald-500 font-bold">↓ Deficit</span> / <span className="text-amber-500 font-bold">↑ Surplus</span>
            </span>
          </div>
        </div>

        {/* CHART 3: Hydration (Water Intake) Bar Chart */}
        <div className="bg-white border border-stone-200/60 rounded-lg p-3 shadow-inner space-y-3">
          <div className="flex items-center justify-between text-xs font-bold text-stone-700 pb-1 border-b border-stone-100">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-sky-400" />
              Hydration Trend
            </span>
            <span className="text-stone-400 font-normal">Daily Water Volume</span>
          </div>

          <div className="relative w-full aspect-[500/220]">
            <svg viewBox="0 0 500 220" className="w-full h-full font-sans select-none overflow-visible">
              {waterGridValues.map((val) => {
                const y = baselineY - val * waterScale;
                return (
                  <g key={val}>
                    <line x1={marginL} y1={y} x2={w - marginR} y2={y} stroke="#f1f5f9" strokeWidth="1" strokeDasharray="3,3" />
                    <text x={marginL - 8} y={y + 3.5} textAnchor="end" className="fill-stone-400 font-medium text-[9px]">{val}</text>
                  </g>
                );
              })}
              
              <line x1={marginL} y1={baselineY} x2={w - marginR} y2={baselineY} stroke="#e2e8f0" strokeWidth="1.5" />
              <text x={marginL - 8} y={baselineY + 3.5} textAnchor="end" className="fill-stone-400 font-semibold text-[9px]">0 ml</text>

              {dailyHistory.map((day, idx) => {
                const x = startX + idx * (colW + colGap);
                const hWater = day.waterMl * waterScale;
                const yWater = baselineY - hWater;
                const dateStr = formatXAxisDate(day.date);
                
                const targetVal = day.waterTarget;
                const isMet = day.waterMl >= targetVal;
                
                const barColor = isMet 
                  ? "#0ea5e9" 
                  : day.waterMl > 0 && day.waterMl < 1000 
                    ? "#fdb96f"
                    : "#7dd3fc";

                return (
                  <g key={day.date} className="group">
                    {hWater > 0 && (
                      <rect x={x} y={yWater} width={colW} height={hWater} fill={barColor} className="transition-all duration-200 group-hover:opacity-90" />
                    )}

                    {day.waterMl > 0 && (
                      <text x={x + colW / 2} y={yWater - 6} textAnchor="middle" className="fill-stone-600 font-bold text-[9px]">{Math.round(day.waterMl)}</text>
                    )}

                    <line
                      x1={x - 4}
                      y1={baselineY - targetVal * waterScale}
                      x2={x + colW + 4}
                      y2={baselineY - targetVal * waterScale}
                      stroke="#38bdf8"
                      strokeWidth="1.5"
                      strokeDasharray="2,2"
                    />

                    <text x={x + colW / 2} y={baselineY + 16} textAnchor="middle" className="fill-stone-500 font-semibold text-[9px]">{dateStr.split(" ")[0]}</text>
                    <text x={x + colW / 2} y={baselineY + 27} textAnchor="middle" className="fill-stone-400 text-[8px]">{dateStr.split(" ")[1]}</text>
                  </g>
                );
              })}

              {dailyHistory.length > 0 && (
                <text
                  x={w - marginR - 6}
                  y={baselineY - dailyHistory[dailyHistory.length - 1].waterTarget * waterScale - 6}
                  textAnchor="end"
                  className="fill-sky-500/80 font-bold text-[8.5px]"
                >
                  Goal: {Math.round(dailyHistory[dailyHistory.length - 1].waterTarget)} ml
                </text>
              )}
            </svg>
          </div>

          <div className="flex flex-wrap gap-x-4 gap-y-1.5 justify-center pt-2.5 text-[9px] text-stone-500 font-semibold border-t border-stone-100">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded bg-sky-500" /> Target Met (💧)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded bg-sky-300" /> Under Goal
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded bg-amber-300" /> Dehydrated (&lt;1000ml)
            </span>
            <span className="flex items-center gap-1 pl-2 border-l border-stone-200">
              <span className="h-0.5 w-4 bg-sky-400 border-t border-dashed border-sky-400" /> Daily Target Level
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
