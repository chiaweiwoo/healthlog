import { ProfileDashboard } from "@/components/app/profile-dashboard";
import { getProfile, listBodyNotes } from "@/lib/db";

export default async function ProfilePage() {
  const [profile, notes] = await Promise.all([
    getProfile().catch(() => null),
    listBodyNotes().catch(() => []),
  ]);

  return <ProfileDashboard initialProfile={profile} initialNotes={notes} />;
}
