"use client";

import { Ruler, UserRound, Weight } from "lucide-react";
import { useState, useTransition } from "react";
import { WarningDot } from "@/components/app/warning-dot";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

type Profile = {
  age?: number | null;
  sex?: "female" | "male" | null;
  heightCm?: number | null;
  weightKg?: number | null;
  activityLevel?: string | null;
  goal?: string | null;
  country?: string | null;
  remarks?: string | null;
};

type Measurement = {
  id: string;
  measured_at: string;
  type: string;
  value: number;
  unit: string;
  confidence: number;
  remarks: string | null;
};

export function BodyDashboard({
  initialProfile,
  initialMeasurements,
}: {
  initialProfile: Profile | null;
  initialMeasurements: Measurement[];
}) {
  const [profile, setProfile] = useState<Profile | null>(initialProfile);
  const [measurements, setMeasurements] = useState<Measurement[]>(initialMeasurements);
  const [note, setNote] = useState("");
  const [warnings, setWarnings] = useState<Array<{ code: string; message: string; improveWith?: string }>>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function submitNote() {
    setError(null);
    const rawNote = note.trim();
    if (!rawNote) return;
    const response = await fetch("/api/body-notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rawNote }),
    });
    const body = (await response.json().catch(() => null)) as
      | {
          profile?: Profile | null;
          measurements?: Measurement[];
          parsed?: { warnings?: Array<{ code: string; message: string; improveWith?: string }> };
          error?: string;
        }
      | null;
    if (!response.ok) {
      setError(body?.error ?? "Could not save body note.");
      return;
    }
    setProfile(body?.profile ?? null);
    setMeasurements(body?.measurements ?? []);
    setWarnings(body?.parsed?.warnings ?? []);
    setNote("");
  }

  const incompleteWarning = !profile?.age || !profile?.sex || !profile?.heightCm || !profile?.weightKg || !profile?.activityLevel;

  return (
    <main className="mx-auto max-w-6xl px-3 py-4 sm:px-4 sm:py-6">
      <div className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
        <section className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Profile</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
              <ProfileTile icon={<UserRound size={16} />} label="Age" value={profile?.age ? String(profile.age) : "Missing"} />
              <ProfileTile icon={<Ruler size={16} />} label="Height" value={profile?.heightCm ? `${profile.heightCm} cm` : "Missing"} />
              <ProfileTile icon={<Weight size={16} />} label="Weight" value={profile?.weightKg ? `${profile.weightKg} kg` : "Missing"} />
              <ProfileTile label="Sex" value={profile?.sex ?? "Missing"} />
              <ProfileTile label="Activity" value={profile?.activityLevel ?? "Missing"} />
              <ProfileTile label="Goal" value={profile?.goal ?? "Not set"} />
              {incompleteWarning ? (
                <div className="col-span-full rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  TDEE and deficit will stay incomplete until age, sex, height, weight, and activity level are filled in.
                </div>
              ) : null}
              {warnings.length ? (
                <div className="col-span-full flex items-center gap-2 rounded-md border border-stone-200 bg-stone-50 p-3 text-sm text-stone-700">
                  <span>Recent parsing warnings</span>
                  <WarningDot warnings={warnings} />
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Body note</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea
                placeholder="Male, 31, 172cm, 78.4kg, light activity. Waist 34in this morning. Want slow fat loss."
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
              {error ? <p className="text-sm text-red-600">{error}</p> : null}
              <Button className="w-full sm:w-auto" disabled={isPending || !note.trim()} onClick={() => startTransition(submitNote)}>
                {isPending ? "Saving..." : "Update body profile"}
              </Button>
            </CardContent>
          </Card>
        </section>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Measurements</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {measurements.length ? (
              measurements.map((measurement) => (
                <div key={measurement.id} className="rounded-lg border border-stone-200 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium text-stone-900">{measurement.type}</p>
                    <p className="text-sm text-stone-500">{new Date(measurement.measured_at).toLocaleDateString()}</p>
                  </div>
                  <p className="mt-2 text-sm text-stone-700">
                    {measurement.value} {measurement.unit}
                  </p>
                  {measurement.remarks ? <p className="mt-1 text-xs text-stone-500">{measurement.remarks}</p> : null}
                </div>
              ))
            ) : (
              <p className="text-sm text-stone-500">No measurements yet.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

function ProfileTile({ icon, label, value }: { icon?: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-md bg-stone-50 p-3">
      <div className="flex items-center gap-2 text-stone-500">
        {icon}
        <p className="text-xs uppercase tracking-wide">{label}</p>
      </div>
      <p className="mt-2 text-sm font-medium text-stone-900">{value}</p>
    </div>
  );
}
