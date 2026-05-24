import { BodyDashboard } from "@/components/app/body-dashboard";
import { getProfile, listBodyMeasurements } from "@/lib/db";

export default async function BodyPage() {
  const [profile, measurements] = await Promise.all([
    getProfile().catch(() => null),
    listBodyMeasurements().catch(() => []),
  ]);

  return <BodyDashboard initialProfile={profile} initialMeasurements={measurements} />;
}
