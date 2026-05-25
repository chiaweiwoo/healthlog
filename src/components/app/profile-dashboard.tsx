"use client";

import { Brain, NotebookPen, Scale, Sparkles, UserRound } from "lucide-react";
import { useMemo, useState } from "react";
import { deriveBmr, deriveNeat, deriveWaterTarget, formatStatusLabel, getProfileMemory } from "@/lib/profile-memory";
import type { Profile, ProfileMemoryItem } from "@/lib/schemas";
import { FullTextDialog } from "@/components/app/full-text-dialog";
import { InfoButton } from "@/components/app/info-button";
import { ProfileManagerSheet } from "@/components/app/profile-manager-sheet";
import { WarningDot } from "@/components/app/warning-dot";

type Warning = { code: string; message: string; improveWith?: string };

type ProfileNote = {
  id: string;
  raw_note: string;
  parse_status: "pending" | "parsed" | "failed";
  parsed_payload?: {
    action?: string;
    profile?: Record<string, unknown>;
    metadataUpserts?: Array<{ id?: string; label?: string; value?: string }>;
    metadataDeletes?: string[];
    overrides?: Record<string, unknown>;
    overrideDeletes?: string[];
  } | null;
  warnings: Warning[];
  parse_error: string | null;
  created_at: string;
};

type ChangeSummary = {
  action?: string;
  profileChanges: Array<{ field: string; before: unknown; after: unknown }>;
  overrideChanges: Array<{ key: string; before: unknown; after: unknown }>;
  memoryChanges: Array<{ id: string; before: unknown; after: unknown }>;
  addedMeasurements: Array<{ id: string; type: string; value: number; unit: string; measuredAt: string }>;
};

type ReadinessRow = {
  label: string;
  value: string;
  status: "ready" | "missing" | "estimated" | "overridden";
  reason: string;
};

const activityLabels: Record<string, string> = {
  sedentary: "Minimal",
  light: "Desk / low movement",
  moderate: "Desk + errands",
  active: "On feet often",
  very_active: "Physical day",
};

const memoryCategoryLabels: Record<ProfileMemoryItem["category"], string> = {
  lifestyle: "Lifestyle",
  diet: "Diet",
  exercise_context: "Exercise context",
  food_context: "Food context",
  medical_context: "Medical context",
  preference: "Preference",
  other: "Other memory",
};

export function ProfileDashboard({
  initialProfile,
  initialNotes,
}: {
  initialProfile: Profile | null;
  initialNotes: ProfileNote[];
}) {
  const [profile, setProfile] = useState<Profile | null>(initialProfile);
  const [notes, setNotes] = useState<ProfileNote[]>(initialNotes);
  const [managerOpen, setManagerOpen] = useState(false);
  const [lastChange, setLastChange] = useState<ChangeSummary | null>(null);

  const waterTarget = deriveWaterTarget(profile);
  const bmr = deriveBmr(profile);
  const neat = deriveNeat(profile);

  const readinessRows: ReadinessRow[] = [
    {
      label: "Water target",
      value: waterTarget.value != null ? `${waterTarget.value} ml/day` : "Missing",
      status: waterTarget.status,
      reason: waterTarget.reason,
    },
    {
      label: "BMR",
      value: bmr.value != null ? `${bmr.value} kcal` : "Missing",
      status: bmr.status,
      reason: bmr.reason,
    },
    {
      label: "NEAT",
      value: neat.value != null ? `${neat.value} kcal` : "Missing",
      status: neat.status,
      reason: neat.reason,
    },
  ];

  const requiredRows = [
    { label: "Age", value: profile?.age ? String(profile.age) : "Missing", missingReason: "Needed for BMR." },
    { label: "Sex", value: profile?.sex ?? "Missing", missingReason: "Needed for BMR and sex fallback hydration." },
    { label: "Height", value: profile?.heightCm ? `${profile.heightCm} cm` : "Missing", missingReason: "Needed for BMR." },
    { label: "Weight", value: profile?.weightKg ? `${profile.weightKg} kg` : "Missing", missingReason: "Needed for BMR and water target." },
    {
      label: "Baseline lifestyle",
      value: profile?.activityLevel ? activityLabels[profile.activityLevel] ?? profile.activityLevel : "Missing",
      missingReason: "Needed for NEAT because it estimates non-exercise movement.",
    },
  ];

  const helpfulRows = [
    { label: "Goal", value: profile?.goal ?? "Not set" },
    { label: "Country", value: profile?.country ?? "Singapore" },
    { label: "Remarks", value: profile?.remarks ?? "None" },
  ];

  const groupedMemory = useMemo(() => {
    const memory = getProfileMemory(profile);
    return Object.entries(
      memory.reduce<Record<string, ProfileMemoryItem[]>>((acc, item) => {
        const key = item.category;
        acc[key] ??= [];
        acc[key].push(item);
        return acc;
      }, {}),
    ) as Array<[ProfileMemoryItem["category"], ProfileMemoryItem[]]>;
  }, [profile]);

  return (
    <main className="mx-auto max-w-2xl px-3 py-4 pb-28 sm:px-4 sm:py-6">
      <div className="space-y-4">
        <section className="rounded-xl border border-stone-200 bg-stone-50/60 p-4 shadow-sm">
          <SectionHeader
            icon={<Sparkles size={18} className="text-emerald-600" />}
            iconBg="bg-emerald-50/70"
            caption="PROFILE FOR DAILY"
            title="Daily readiness"
            action={
              <InfoButton
                title="Why Daily needs profile inputs"
                description={
                  <div className="space-y-2">
                    <p>Daily uses profile data for three estimated pieces: water target, BMR, and NEAT.</p>
                    <ul className="list-disc space-y-1 pl-4">
                      <li>Water target prefers weight, with a sex fallback if needed.</li>
                      <li>BMR needs age, sex, height, and weight unless you override it.</li>
                      <li>NEAT needs baseline lifestyle and BMR unless you override it.</li>
                    </ul>
                    <p>TEF comes from today&apos;s food, and EAT comes from logged exercise on Daily.</p>
                  </div>
                }
              />
            }
          />
          <div className="mt-3 overflow-hidden rounded-lg border border-stone-200 bg-white/90">
            {readinessRows.map((row) => (
              <ProfileRow
                key={row.label}
                label={row.label}
                value={row.value}
                status={formatStatusLabel(row.status)}
                caption={row.reason}
              />
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-stone-200 bg-stone-50/60 p-4 shadow-sm">
          <SectionHeader
            icon={<UserRound size={18} className="text-stone-500" />}
            iconBg="bg-stone-100/70"
            caption="PROFILE MEMORY"
            title="Required for Daily"
          />
          <div className="mt-3 overflow-hidden rounded-lg border border-stone-200 bg-white/90">
            {requiredRows.map((row) => (
              <ProfileRow
                key={row.label}
                label={row.label}
                value={row.value}
                status={row.value === "Missing" ? "Missing" : "Provided"}
                caption={row.value === "Missing" ? row.missingReason : undefined}
              />
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-stone-200 bg-stone-50/60 p-4 shadow-sm">
          <SectionHeader
            icon={<Brain size={18} className="text-indigo-500" />}
            iconBg="bg-indigo-50/70"
            caption="DAILY ESTIMATES"
            title="Derived and overrides"
          />
          <div className="mt-3 overflow-hidden rounded-lg border border-stone-200 bg-white/90">
            <ProfileRow label="Water target" value={readinessRows[0].value} status={formatStatusLabel(waterTarget.status)} caption={waterTarget.reason} />
            <ProfileRow label="BMR" value={readinessRows[1].value} status={formatStatusLabel(bmr.status)} caption={bmr.reason} />
            <ProfileRow label="NEAT" value={readinessRows[2].value} status={formatStatusLabel(neat.status)} caption={neat.reason} />
          </div>
        </section>

        <section className="rounded-xl border border-stone-200 bg-stone-50/60 p-4 shadow-sm">
          <SectionHeader
            icon={<Scale size={18} className="text-sky-500" />}
            iconBg="bg-sky-50/70"
            caption="HELPFUL CONTEXT"
            title="Profile knowledge"
          />
          <div className="mt-3 overflow-hidden rounded-lg border border-stone-200 bg-white/90">
            {helpfulRows.map((row) => (
              <ProfileRow key={row.label} label={row.label} value={row.value} status={row.value === "None" || row.value === "Not set" ? "Optional" : "Provided"} />
            ))}
            {groupedMemory.length ? (
              groupedMemory.flatMap(([category, items]) =>
                items.map((item, index) => (
                  <ProfileRow
                    key={item.id}
                    label={index === 0 ? memoryCategoryLabels[category] : " "}
                    value={`${item.label}: ${item.value}`}
                    status="Memory"
                    fullTextTitle={item.label}
                  />
                )),
              )
            ) : (
              <ProfileRow
                label="Other memory"
                value="No extra profile memory yet"
                status="Optional"
                caption="Add lifestyle, diet, food context, or preference notes through the profile manager."
              />
            )}
          </div>
          {lastChange && (lastChange.profileChanges.length || lastChange.overrideChanges.length || lastChange.memoryChanges.length) ? (
            <div className="mt-3 rounded-lg border border-stone-200 bg-white/85 p-3 text-sm text-stone-600">
              <p className="font-semibold text-stone-900">Latest update</p>
              <div className="mt-2 space-y-1">
                {lastChange.profileChanges.map((change) => (
                  <p key={change.field}>
                    {change.field}: {String(change.after ?? "Cleared")}
                  </p>
                ))}
                {lastChange.overrideChanges.map((change) => (
                  <p key={change.key}>
                    {change.key}: {String(change.after ?? "Cleared")}
                  </p>
                ))}
                {lastChange.memoryChanges.map((change) => (
                  <p key={change.id}>
                    Memory {change.after ? "updated" : "deleted"}: {change.id}
                  </p>
                ))}
              </div>
            </div>
          ) : null}
        </section>

        <section className="rounded-xl border border-stone-200 bg-stone-50/60 p-4 shadow-sm">
          <SectionHeader
            icon={<NotebookPen size={18} className="text-stone-500" />}
            iconBg="bg-stone-100/70"
            caption="AUDIT TRAIL"
            title="Recent profile notes"
          />
          <div className="mt-3 space-y-2">
            {notes.length ? (
              notes.map((note) => (
                <article key={note.id} className="rounded-lg border border-stone-200 bg-white/90 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <FullTextDialog
                        title="Profile note"
                        text={note.raw_note}
                        className="block"
                        previewClassName="break-words text-sm font-semibold text-stone-900"
                      />
                      <p className="mt-1 text-xs text-stone-400">{new Date(note.created_at).toLocaleString()}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <StatusBadge status={note.parse_status} />
                      <WarningDot warnings={note.warnings} label="Profile note warnings" />
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-stone-500">{describeNoteChange(note)}</p>
                  {note.parse_error ? <p className="mt-2 text-xs text-amber-700">{note.parse_error}</p> : null}
                </article>
              ))
            ) : (
              <div className="rounded-lg border border-dashed border-stone-200 bg-white/60 p-4 text-sm text-stone-500">
                No profile notes yet.
              </div>
            )}
          </div>
        </section>
      </div>

      <button
        type="button"
        aria-label="Open profile manager"
        onClick={() => setManagerOpen(true)}
        className="fixed right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-600 text-white shadow-lg transition-all duration-150 hover:bg-emerald-700 active:scale-95 sm:right-6"
        style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 6rem)" }}
      >
        <NotebookPen size={22} />
      </button>

      <ProfileManagerSheet
        open={managerOpen}
        onOpenChange={setManagerOpen}
        onSubmitted={({ profile: nextProfile, notes: nextNotes, changeSummary }) => {
          setProfile((nextProfile as Profile | null) ?? null);
          setNotes(nextNotes);
          setLastChange(changeSummary ?? null);
        }}
      />
    </main>
  );
}

function describeNoteChange(note: ProfileNote) {
  if (note.parse_status === "failed") return "Saved, but this note still needs clarification.";
  if (note.parse_status === "pending") return "Processing profile manager update.";

  const parsed = note.parsed_payload;
  const segments: string[] = [];
  if (parsed?.action) segments.push(parsed.action.replace(/_/g, " "));
  const profileFields = parsed?.profile ? Object.keys(parsed.profile).filter((key) => key !== "metadata") : [];
  if (profileFields.length) segments.push(`profile: ${profileFields.join(", ")}`);
  if (parsed?.metadataUpserts?.length) segments.push(`memory: ${parsed.metadataUpserts.length} updated`);
  if (parsed?.metadataDeletes?.length) segments.push(`memory: ${parsed.metadataDeletes.length} deleted`);
  if (parsed?.overrides && Object.keys(parsed.overrides).length) segments.push(`overrides: ${Object.keys(parsed.overrides).join(", ")}`);
  if (parsed?.overrideDeletes?.length) segments.push(`override cleared: ${parsed.overrideDeletes.join(", ")}`);
  return segments.length ? segments.join(" • ") : "Profile manager update applied.";
}

function ProfileRow({
  label,
  value,
  status,
  caption,
  fullTextTitle,
}: {
  label: string;
  value: string;
  status: string;
  caption?: string;
  fullTextTitle?: string;
}) {
  const statusStyle =
    status === "Missing"
      ? "bg-amber-50 text-amber-800"
      : status === "Overridden"
        ? "bg-sky-50 text-sky-700"
        : status === "Estimated"
          ? "bg-stone-100 text-stone-700"
          : "bg-emerald-50 text-emerald-700";

  return (
    <div className="border-b border-stone-200 px-3 py-2.5 last:border-b-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-stone-700">{label}</p>
          {caption ? <p className="mt-0.5 text-xs text-stone-400">{caption}</p> : null}
        </div>
        <div className="min-w-0 text-right">
          {fullTextTitle ? (
            <FullTextDialog
              title={fullTextTitle}
              text={value}
              previewClassName="break-words text-sm font-semibold text-stone-900"
              className="inline-block max-w-[180px]"
            />
          ) : (
            <p className="break-words text-sm font-semibold text-stone-900">{value}</p>
          )}
          <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${statusStyle}`}>{status}</span>
        </div>
      </div>
    </div>
  );
}

function SectionHeader({
  icon,
  caption,
  title,
  action,
  iconBg = "bg-stone-50",
}: {
  icon: React.ReactNode;
  caption: string;
  title: string;
  action?: React.ReactNode;
  iconBg?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-stone-200/60 ${iconBg}`}>
          {icon}
        </div>
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400">{caption}</span>
          <p className="text-base font-bold leading-tight text-stone-900">{title}</p>
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

function StatusBadge({ status }: { status: ProfileNote["parse_status"] }) {
  const styles =
    status === "parsed"
      ? "bg-emerald-50 text-emerald-700"
      : status === "failed"
        ? "bg-amber-100 text-amber-800"
        : "bg-stone-100 text-stone-700";

  const label = status === "parsed" ? "Applied" : status === "failed" ? "Needs detail" : "Processing";

  return <span className={`rounded-full px-2 py-1 text-[11px] font-medium ${styles}`}>{label}</span>;
}
