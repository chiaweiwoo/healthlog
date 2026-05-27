import { AnalysisDashboard } from "@/components/app/analysis-dashboard";
import { ProfileSetupOverlay } from "@/components/app/profile-setup-overlay";
import { getProfile } from "@/lib/db";
import { isProfileComplete } from "@/lib/profile-memory";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getCachedRealTimeAnalysisStats } from "@/lib/analysis-cache";
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
  
  // 1. Calculate dynamic cached real-time stats and contributor evidence from DB
  const { stats, evidence } = await getCachedRealTimeAnalysisStats(profile, todayStr).catch((err) => {
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

  // 2. Fetch the latest compiled AI report if available
  const supabase = getSupabaseAdmin();
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

  // Always render the AnalysisDashboard, passing both local real-time stats/evidence and the optional AI report details
  return (
    <main>
      <AnalysisDashboard 
        stats={stats} 
        evidence={evidence} 
        report={report?.payload || null} 
      />
    </main>
  );
}
