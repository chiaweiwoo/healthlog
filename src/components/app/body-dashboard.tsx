"use client";

import { Ruler, UserRound, Weight } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { WarningDot } from "@/components/app/warning-dot";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type Warning = { code: string; message: string; improveWith?: string };

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

type BodyNote = {
  id: string;
  raw_note: string;
  parse_status: "pending" | "parsed" | "failed";
  warnings: Warning[];
  parse_error: string | null;
  created_at: string;
};

type ChangeSummary = {
  profileChanges: Array<{ field: string; before: unknown; after: unknown }>;
  addedMeasurements: Array<{ id: string; type: string; value: number; unit: string; measuredAt: string }>;
};

const activityOptions = [
  { value: "sedentary", label: "Sedentary" },
  { value: "light", label: "Light" },
  { value: "moderate", label: "Moderate" },
  { value: "active", label: "Active" },
  { value: "very_active", label: "Very active" },
] as const;

export function BodyDashboard({
  initialProfile,
  initialMeasurements,
  initialNotes,
}: {
  initialProfile: Profile | null;
  initialMeasurements: Measurement[];
  initialNotes: BodyNote[];
}) {
  const [profile, setProfile] = useState<Profile | null>(initialProfile);
  const [measurements, setMeasurements] = useState<Measurement[]>(initialMeasurements);
  const [notes, setNotes] = useState<BodyNote[]>(initialNotes);
  const [note, setNote] = useState("");
  const [lastChange, setLastChange] = useState<ChangeSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const missingFields = [
    !profile?.age ? "Age" : null,
    !profile?.sex ? "Sex" : null,
    !profile?.heightCm ? "Height" : null,
    !profile?.weightKg ? "Weight" : null,
    !profile?.activityLevel ? "Activity level" : null,
  ].filter(Boolean) as string[];

  async function saveBodyNote(rawNote: string, messages?: { loading: string; success: string }) {
    setError(null);
    const loadingMsg = messages?.loading ?? "Updating body profile...";
    const successMsg = messages?.success ?? "Body profile updated successfully.";
    const toastId = toast.loading(loadingMsg);
    try {
      const response = await fetch("/api/body-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawNote }),
      });
      const body = (await response.json().catch(() => null)) as
        | {
            profile?: Profile | null;
            measurements?: Measurement[];
            notes?: BodyNote[];
            bodyNote?: BodyNote;
            changeSummary?: ChangeSummary;
            error?: string;
            requestId?: string;
          }
        | null;
      if (!response.ok) {
        const errorMsg = body?.requestId ? `${body.error ?? "Could not save body note."} (${body.requestId})` : (body?.error ?? "Could not save body note.");
        setError(errorMsg);
        toast.error(errorMsg, { id: toastId });
        return;
      }
      setProfile(body?.profile ?? null);
      setMeasurements(body?.measurements ?? []);
      setNotes(body?.notes ?? []);
      setLastChange(body?.changeSummary ?? null);
      setNote("");
      if (body?.bodyNote?.parse_status === "failed") {
        toast.warning("Saved, but profile update needs detail.", { id: toastId });
      } else {
        toast.success(successMsg, { id: toastId });
      }
    } catch {
      toast.error("Could not save body note.", { id: toastId });
    }
  }

  async function submitNote() {
    const rawNote = note.trim();
    if (!rawNote) return;
    await saveBodyNote(rawNote, {
      loading: "Saving body profile...",
      success: "Body profile updated successfully.",
    });
  }

  async function setActivityLevel(value: string) {
    const label = activityOptions.find((opt) => opt.value === value)?.label ?? value;
    await saveBodyNote(`Activity level: ${value}`, {
      loading: `Updating activity level to ${label}...`,
      success: "Activity level updated.",
    });
  }

  return (
    <main className="mx-auto max-w-6xl overflow-x-hidden px-3 py-4 sm:px-4 sm:py-6">
      <div className="grid min-w-0 gap-4 lg:grid-cols-[0.95fr_1.05fr]">
        <section className="min-w-0 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Profile</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
                <ProfileTile icon={<UserRound size={16} />} label="Age" value={profile?.age ? String(profile.age) : "Missing"} />
                <ProfileTile icon={<Ruler size={16} />} label="Height" value={profile?.heightCm ? `${profile.heightCm} cm` : "Missing"} />
                <ProfileTile icon={<Weight size={16} />} label="Weight" value={profile?.weightKg ? `${profile.weightKg} kg` : "Missing"} />
                <ProfileTile label="Sex" value={profile?.sex ?? "Missing"} />
                <ProfileTile label="Activity" value={profile?.activityLevel ?? "Missing"} />
                <ProfileTile label="Goal" value={profile?.goal ?? "Not set"} />
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium text-stone-900">Activity level</p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                  {activityOptions.map((option) => (
                    <button
                      key={option.value}
                      className={cn(
                        "min-h-10 rounded-md border px-3 py-2 text-sm font-medium transition",
                        profile?.activityLevel === option.value
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                          : "border-stone-200 bg-white text-stone-700 hover:bg-stone-50",
                      )}
                      disabled={isPending}
                      onClick={() => startTransition(() => setActivityLevel(option.value))}
                      type="button"
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              {missingFields.length ? (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
                  <p className="text-sm font-medium text-amber-900">TDEE needs a few more profile fields</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {missingFields.map((field) => (
                      <span key={field} className="rounded-full bg-white px-2 py-1 text-xs text-amber-900">
                        {field}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}

              {lastChange && (lastChange.profileChanges.length || lastChange.addedMeasurements.length) ? (
                <div className="rounded-md border border-stone-200 bg-stone-50 p-3">
                  <p className="text-sm font-medium text-stone-900">Latest update</p>
                  <div className="mt-2 space-y-2 text-sm text-stone-600">
                    {lastChange.profileChanges.map((change) => (
                      <p key={change.field}>
                        {change.field}: {String(change.after ?? "Cleared")}
                      </p>
                    ))}
                    {lastChange.addedMeasurements.map((measurement) => (
                      <p key={measurement.id}>
                        Added {measurement.type}: {measurement.value} {measurement.unit}
                      </p>
                    ))}
                  </div>
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

        <div className="min-w-0 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Measurements</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {measurements.length ? (
                measurements.map((measurement) => (
                  <div key={measurement.id} className="rounded-lg border border-stone-200 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-medium capitalize text-stone-900">{measurement.type.replace(/_/g, " ")}</p>
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

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Recent notes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {notes.length ? (
                notes.map((bodyNote) => (
                  <div key={bodyNote.id} className="rounded-lg border border-stone-200 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-stone-900">{bodyNote.raw_note}</p>
                        <p className="mt-1 text-xs text-stone-500">{new Date(bodyNote.created_at).toLocaleString()}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        <BodyNoteBadge status={bodyNote.parse_status} />
                        <WarningDot warnings={bodyNote.warnings} label="Body note warnings" />
                      </div>
                    </div>
                    {bodyNote.parse_error ? <p className="mt-2 text-xs text-amber-700">{bodyNote.parse_error}</p> : null}
                  </div>
                ))
              ) : (
                <p className="text-sm text-stone-500">No body notes yet.</p>
              )}
            </CardContent>
          </Card>
        </div>
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

function BodyNoteBadge({ status }: { status: BodyNote["parse_status"] }) {
  const styles =
    status === "parsed"
      ? "bg-emerald-50 text-emerald-700"
      : status === "failed"
        ? "bg-amber-100 text-amber-800"
        : "bg-stone-100 text-stone-700";

  const label = status === "parsed" ? "Parsed" : status === "failed" ? "Needs detail" : "Parsing";

  return <span className={`rounded-full px-2 py-1 text-[11px] font-medium ${styles}`}>{label}</span>;
}
