import { AnalysisDashboard } from "@/components/app/analysis-dashboard";
import { ProfileSetupOverlay } from "@/components/app/profile-setup-overlay";
import { BarChart3, HelpCircle } from "lucide-react";
import { getProfile } from "@/lib/db";
import { isProfileComplete } from "@/lib/profile-memory";
import { getSupabaseAdmin } from "@/lib/supabase";

export const revalidate = 0; // Ensure the page is always dynamic

export default async function AnalysisPage() {
  const profile = await getProfile().catch(() => null);
  const profileComplete = isProfileComplete(profile);

  if (!profileComplete) {
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

  if (!report || !report.payload || Object.keys(report.payload).length === 0) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-8 space-y-6">
        <div className="text-center py-12 px-6 rounded-xl border border-stone-200 bg-stone-50/60 shadow-sm space-y-4">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg border border-stone-200 bg-white text-stone-400">
            <BarChart3 size={24} />
          </div>
          <div className="max-w-md mx-auto space-y-2">
            <h2 className="text-base font-bold text-stone-900">7-Day Analysis Pending</h2>
            <p className="text-xs text-stone-500 leading-relaxed">
              Your 7-day nutritional and behavioral reviews are generated via a manual analysis pipeline.
              Once the GitHub Actions workflow triggers, your latest insights, root causes, and focus areas will automatically appear here.
            </p>
          </div>
          <div className="pt-2">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-stone-100 border border-stone-200 px-3 py-1 text-[10px] font-medium text-stone-600">
              <HelpCircle size={12} className="text-stone-400" />
              <span>Trigger &quot;Analyze 7-day HealthLog&quot; via GitHub Actions</span>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main>
      <AnalysisDashboard payload={report.payload} />
    </main>
  );
}
