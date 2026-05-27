import { format } from "date-fns";
import { DailyDashboard } from "@/components/app/daily-dashboard";
import { getDailySummary, listDailyEntries, getProfile } from "@/lib/db";
import { isProfileComplete } from "@/lib/profile-memory";

export default async function AppPage() {
  const date = format(new Date(), "yyyy-MM-dd");
  const [entries, summary, profile] = await Promise.all([
    listDailyEntries(date)
      .then((rows) => rows.filter((e) => e.is_active))
      .catch(() => []),
    getDailySummary(date).catch(() => null),
    getProfile().catch(() => null),
  ]);

  return (
    <DailyDashboard
      initialDate={date}
      initialEntries={entries}
      initialSummary={summary}
      profile={profile}
      profileComplete={isProfileComplete(profile)}
    />
  );
}
