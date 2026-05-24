import { BodyDashboard } from "@/components/app/body-dashboard";
import { getProfile, listBodyMeasurements, listBodyNotes } from "@/lib/db";

export default async function BodyPage() {
  const [profile, measurements, notes] = await Promise.all([
    getProfile().catch(() => null),
    listBodyMeasurements().catch(() => []),
    listBodyNotes().catch(() => []),
  ]);

  return <BodyDashboard initialProfile={profile} initialMeasurements={measurements} initialNotes={notes} />;
}
