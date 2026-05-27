import { ProfileDashboard } from "@/components/app/profile-dashboard";
import { getProfile, listBodyMeasurements } from "@/lib/db";

export default async function ProfilePage() {
  const [profile, measurements] = await Promise.all([
    getProfile().catch(() => null),
    listBodyMeasurements().catch(() => []),
  ]);

  return <ProfileDashboard initialProfile={profile} initialMeasurements={measurements} />;
}
