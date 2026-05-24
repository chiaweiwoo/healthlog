import { format } from "date-fns";
import { DailyDashboard } from "@/components/app/daily-dashboard";
import { getDailySummary, listDailyEntries } from "@/lib/db";

export default async function AppPage() {
  const date = format(new Date(), "yyyy-MM-dd");
  const [entries, summary] = await Promise.all([
    listDailyEntries(date).catch(() => []),
    getDailySummary(date).catch(() => null),
  ]);

  return <DailyDashboard initialDate={date} initialEntries={entries} initialSummary={summary} />;
}
