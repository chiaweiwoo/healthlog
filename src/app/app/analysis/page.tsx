import { AnalysisDashboard } from "@/components/app/analysis-dashboard";
import { ProfileSetupOverlay } from "@/components/app/profile-setup-overlay";
import { getProfile } from "@/lib/db";
import { isProfileComplete, deriveWaterTarget } from "@/lib/profile-memory";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getRealTimeAnalysisStats } from "@/lib/analysis";
import { calculateBmr, calculateTdee } from "@/lib/calculations";
import { format } from "date-fns";

export const revalidate = 0; // Ensure the page is always dynamic

export default async function AnalysisPage() {
  const profile = await getProfile().catch(() => null);
  const profileComplete = isProfileComplete(profile);

  if (!profileComplete || !profile) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-8">
        <ProfileSetupOverlay
          title="Analysis needs your profile"
          body="Set up your basic info first so analysis can calculate accurate targets and recommendations."
          secondary="Head to Profile and tell the app about yourself to unlock analysis."
        />
      </main>
    );
  }

  const todayStr = format(new Date(), "yyyy-MM-dd");
  
  // 1. Calculate real-time stats and contributor evidence from DB dynamically (no cache)
  const { stats, evidence } = await getRealTimeAnalysisStats(profile, todayStr).catch((err) => {
    console.error("Error calculating real-time stats:", err);
    return {
      stats: {
        periodStart: todayStr,
        periodEnd: todayStr,
        completeDays: 0,
        totalIntakeCalories: 0,
        averageIntakeCalories: 0,
        averageQuotaCalories: null,
        averageNetCalories: null,
        totalProteinG: 0,
        averageProteinG: 0,
        totalFatG: 0,
        averageFatG: 0,
        totalCarbsG: 0,
        averageCarbsG: 0,
        totalAlcoholG: 0,
        averageAlcoholG: 0,
        averageWaterMl: 0,
        averageExerciseCalories: 0,
        consistencyScore: 0,
      },
      evidence: {
        topCalorieFoods: [],
        alcoholContributors: [],
        waterContributors: [],
        exerciseContributors: [],
        highCalorieLowProteinCandidates: [],
      },
    };
  });

  // 2. Fetch daily summaries ending today (inclusive) to display in diagrams
  const past7DaysInclusive = [];
  const [year, month, day] = todayStr.split("-").map(Number);
  const todayDate = new Date(Date.UTC(year, month - 1, day));
  for (let i = 6; i >= 0; i--) {
    const d = new Date(todayDate.getTime() - i * 24 * 60 * 60 * 1000);
    past7DaysInclusive.push(d.toISOString().split("T")[0]);
  }
  const startDate = past7DaysInclusive[0];
  const endDate = past7DaysInclusive[past7DaysInclusive.length - 1];

  const supabase = getSupabaseAdmin();
  const { data: dbSummaries, error: summariesErr } = await supabase
    .from("daily_summaries")
    .select("*")
    .gte("entry_date", startDate)
    .lte("entry_date", endDate)
    .order("entry_date", { ascending: true });

  if (summariesErr) {
    console.error("Error fetching daily summaries for charts:", summariesErr);
  }

  // Calculate profile-based default values for incomplete/unlogged days
  const profileBmr = calculateBmr(profile).bmr ?? 1500;
  const profileTdeeObj = calculateTdee(profile);
  const profileTdee = profileTdeeObj.tdee ?? 2000;
  const profileBaseTdee = profileTdeeObj.baseTdee ?? 2000;
  const profileWaterTarget = deriveWaterTarget(profile).value ?? 2000;

  const summariesByDate = Object.fromEntries(
    (dbSummaries || []).map((row) => [row.entry_date, row])
  );

  const dailyHistory = past7DaysInclusive.map((date) => {
    const summary = summariesByDate[date];
    const bmr = summary && summary.bmr ? Number(summary.bmr) : profileBmr;
    const baseTdee = summary && summary.base_tdee ? Number(summary.base_tdee) : profileBaseTdee;
    const exerciseCalories = summary ? Number(summary.exercise_calories) : 0;
    
    let tefCalories = 0;
    let tdee = profileTdee;
    
    if (summary && summary.tdee && summary.base_tdee) {
      tdee = Number(summary.tdee);
      tefCalories = Math.max(0, tdee - Number(summary.base_tdee) - exerciseCalories);
    } else {
      tdee = baseTdee || profileTdee;
      tefCalories = 0;
    }

    const waterTargetVal = summary && summary.profile_snapshot?.waterTarget?.value
      ? Number(summary.profile_snapshot.waterTarget.value)
      : profileWaterTarget;

    return {
      date,
      calories: summary ? Number(summary.calories) : 0,
      proteinG: summary ? Number(summary.protein_g) : 0,
      fatG: summary ? Number(summary.fat_g) : 0,
      carbsG: summary ? Number(summary.carbs_g) : 0,
      alcoholG: summary ? Number(summary.alcohol_g) : 0,
      waterMl: summary ? Number(summary.water_ml) : 0,
      exerciseCalories,
      bmr,
      baseTdee,
      tefCalories,
      tdee,
      waterTarget: waterTargetVal,
    };
  });

  // 3. Fetch the latest compiled AI report if available
  const { data: report, error } = await supabase
    .from("analysis_reports")
    .select("*")
    .order("period_end", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("Error fetching analysis report:", error);
  }

  // Always render the AnalysisDashboard, passing the dailyHistory trend data
  return (
    <main>
      <AnalysisDashboard 
        stats={stats} 
        evidence={evidence} 
        report={report?.payload || null} 
        dailyHistory={dailyHistory}
      />
    </main>
  );
}
