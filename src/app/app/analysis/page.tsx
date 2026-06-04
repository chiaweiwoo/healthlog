import { AnalysisDashboard } from "@/components/app/analysis-dashboard";
import { ProfileSetupOverlay } from "@/components/app/profile-setup-overlay";
import { getProfile } from "@/lib/db";
import { isProfileComplete, deriveWaterTarget } from "@/lib/profile-memory";
import { getSupabaseAdmin } from "@/lib/supabase";
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

  // Fetch daily summaries for the last 14 days
  const past14DaysInclusive = [];
  const [year, month, day] = todayStr.split("-").map(Number);
  const todayDate = new Date(Date.UTC(year, month - 1, day));
  for (let i = 13; i >= 0; i--) {
    const d = new Date(todayDate.getTime() - i * 24 * 60 * 60 * 1000);
    past14DaysInclusive.push(d.toISOString().split("T")[0]);
  }
  const startDate = past14DaysInclusive[0];
  const endDate = past14DaysInclusive[past14DaysInclusive.length - 1];
 
  const supabase = getSupabaseAdmin();
  const { data: dbSummaries, error: summariesErr } = await supabase
    .from("daily_summaries")
    .select("*")
    .gte("entry_date", startDate)
    .lte("entry_date", endDate)
    .order("entry_date", { ascending: true });
 
  if (summariesErr) {
    console.error("Error fetching daily summaries for history:", summariesErr);
  }

  // Profile-based fallback values for days with no summary
  const profileBmr = calculateBmr(profile).bmr ?? 1500;
  const profileTdeeObj = calculateTdee(profile);
  const profileTdee = profileTdeeObj.tdee ?? 2000;
  const profileBaseTdee = profileTdeeObj.baseTdee ?? 2000;
  const profileWaterTarget = deriveWaterTarget(profile).value ?? 2000;
 
  const summariesByDate = Object.fromEntries(
    (dbSummaries || []).map((row) => [row.entry_date, row])
  );
 
  const dailyHistory = past14DaysInclusive.map((date) => {
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
      isLogged: !!summary,
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

  return (
    <main>
      <AnalysisDashboard dailyHistory={dailyHistory} />
    </main>
  );
}
