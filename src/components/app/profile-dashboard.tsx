"use client";

import { Brain, ChevronDown, MessageCircle, UserRound } from "lucide-react";
import { useMemo, useState } from "react";
import { InfoButton } from "@/components/app/info-button";
import { ProfileManagerSheet } from "@/components/app/profile-manager-sheet";
import { deriveBmr, deriveNeat, deriveWaterTarget, formatStatusLabel, getProfileMemory } from "@/lib/profile-memory";
import type { Profile, ProfileMemoryCategory, ProfileMemoryItem } from "@/lib/schemas";

type BodyMeasurement = {
  id: string;
  measured_at: string;
  type: string;
  value: number;
  unit: string;
  confidence: number;
  remarks: string | null;
  metadata: Record<string, unknown>;
};

type DerivedRow = {
  label: string;
  value: string;
  status: string;
  caption: string;
};

const activityLabels: Record<string, string> = {
  sedentary: "Minimal",
  light: "Desk / low movement",
  moderate: "Desk + errands",
  active: "On feet often",
  very_active: "Physical day",
};

const memoryCategoryLabels: Record<ProfileMemoryCategory, string> = {
  exercise_context: "Exercise context",
  diet: "Diet / Food context",
  food_context: "Diet / Food context",
  medical_context: "Medical context",
  lifestyle: "Lifestyle",
  preference: "Preference",
  other: "Other",
};

export function ProfileDashboard({
  initialProfile,
  initialMeasurements,
}: {
  initialProfile: Profile | null;
  initialMeasurements: BodyMeasurement[];
}) {
  const [profile, setProfile] = useState<Profile | null>(initialProfile);
  const [measurements, setMeasurements] = useState<BodyMeasurement[]>(initialMeasurements);
  const [managerOpen, setManagerOpen] = useState(false);
  const [measurementsOpen, setMeasurementsOpen] = useState(false);

  const waterTarget = deriveWaterTarget(profile);
  const bmr = deriveBmr(profile);
  const neat = deriveNeat(profile);

  const essentialRows = [
    {
      label: "Age",
      value: profile?.age ? String(profile.age) : "Missing",
      caption: undefined,
    },
    {
      label: "Sex",
      value: profile?.sex ? capitalize(profile.sex) : "Missing",
      caption: undefined,
    },
    {
      label: "Height",
      value: profile?.heightCm ? `${profile.heightCm} cm` : "Missing",
      caption: undefined,
    },
    {
      label: "Weight",
      value: profile?.weightKg ? `${profile.weightKg} kg` : "Missing",
      caption: undefined,
    },
    {
      label: "Baseline lifestyle",
      value: profile?.activityLevel ? (activityLabels[profile.activityLevel] ?? profile.activityLevel) : "Missing",
      caption: "Used for NEAT only, excluding explicitly logged exercise.",
    },
  ];

  const derivedRows: DerivedRow[] = [
    {
      label: "BMR",
      value: bmr.value != null ? `${bmr.value} kcal` : "Missing",
      status: formatStatusLabel(bmr.status),
      caption: bmr.reason,
    },
    {
      label: "NEAT",
      value: neat.value != null ? `${neat.value} kcal` : "Missing",
      status: formatStatusLabel(neat.status),
      caption: neat.reason,
    },
    {
      label: "Water target",
      value: waterTarget.value != null ? `${waterTarget.value} ml/day` : "Missing",
      status: formatStatusLabel(waterTarget.status),
      caption: waterTarget.reason,
    },
  ];

  const latestMeasurements = useMemo(() => {
    const seen = new Set<string>();
    const rows: BodyMeasurement[] = [];
    for (const measurement of measurements) {
      if (seen.has(measurement.type)) continue;
      seen.add(measurement.type);
      rows.push(measurement);
    }
    return rows;
  }, [measurements]);

  const groupedMemory = useMemo(() => {
    const memory = getProfileMemory(profile);
    const groups = new Map<string, ProfileMemoryItem[]>();
    for (const item of memory) {
      const label = memoryCategoryLabels[item.category];
      const list = groups.get(label) ?? [];
      list.push(item);
      groups.set(label, list);
    }

    return Array.from(groups.entries())
      .map(([label, items]) => [label, items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))] as const)
      .sort((a, b) => a[0].localeCompare(b[0]));
  }, [profile]);

  return (
    <main className="mx-auto max-w-2xl px-3 py-4 pb-28 sm:px-4 sm:py-6">
      <div className="space-y-4">
        <section className="rounded-xl border border-stone-200 bg-stone-50/60 p-4 shadow-sm">
          <SectionHeader
            icon={<UserRound size={18} className="text-stone-600" />}
            iconBg="bg-stone-100/70"
            caption="ESSENTIALS"
            title="Profile for Daily"
            action={
              <InfoButton
                title="Why this matters"
                description="Daily needs these basics to estimate BMR, water target, energy output, and analysis quality."
              />
            }
          />

          <div className="mt-3 overflow-hidden rounded-lg border border-stone-200 bg-white/90">
            {essentialRows.map((row) => (
              <ProfileRow
                key={row.label}
                label={row.label}
                value={row.value}
                status={row.value === "Missing" ? "Missing" : "Provided"}
                caption={row.caption}
              />
            ))}
          </div>

          <div className="mt-4 overflow-hidden rounded-lg border border-stone-200 bg-white/90">
            {derivedRows.map((row) => (
              <ProfileRow key={row.label} label={row.label} value={row.value} status={row.status} caption={row.caption} />
            ))}
          </div>

          <div className="mt-4 overflow-hidden rounded-lg border border-stone-200 bg-white/90">
            <button
              type="button"
              onClick={() => setMeasurementsOpen((current) => !current)}
              className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left"
              aria-expanded={measurementsOpen}
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-stone-900">Latest body measurements</p>
                <p className="mt-0.5 text-xs text-stone-400">
                  {latestMeasurements.length
                    ? "Newest value for each measurement type."
                    : "No body measurements saved yet."}
                </p>
              </div>
              <ChevronDown
                size={16}
                className={`shrink-0 text-stone-400 transition-transform ${measurementsOpen ? "rotate-180" : ""}`}
              />
            </button>
            {measurementsOpen ? (
              latestMeasurements.length ? (
                <div className="border-t border-stone-200">
                  {latestMeasurements.map((measurement) => (
                    <ProfileRow
                      key={measurement.id}
                      label={formatMeasurementType(measurement.type)}
                      value={`${measurement.value} ${measurement.unit}`}
                      status={formatMeasuredAt(measurement.measured_at)}
                      caption={measurement.remarks ?? undefined}
                    />
                  ))}
                </div>
              ) : (
                <div className="border-t border-stone-200 px-3 py-3 text-sm text-stone-500">No measurements yet.</div>
              )
            ) : null}
          </div>
        </section>

        <section className="rounded-xl border border-stone-200 bg-stone-50/60 p-4 shadow-sm">
          <SectionHeader
            icon={<Brain size={18} className="text-indigo-500" />}
            iconBg="bg-indigo-50/70"
            caption="CONTEXT"
            title="Profile knowledge"
          />

          <div className="mt-3 overflow-hidden rounded-lg border border-stone-200 bg-white/90">
            <ProfileRow
              label="Goal"
              value={profile?.goal?.trim() ? profile.goal : "Not set"}
              status={profile?.goal?.trim() ? "Provided" : "Optional"}
            />
          </div>

          {groupedMemory.length ? (
            <div className="mt-4 space-y-3">
              {groupedMemory.map(([label, items]) => (
                <section key={label} className="overflow-hidden rounded-lg border border-stone-200 bg-white/90">
                  <div className="border-b border-stone-200 px-3 py-2">
                    <p className="text-xs font-bold uppercase tracking-wide text-stone-500">{label}</p>
                  </div>
                  <div className="divide-y divide-stone-200">
                    {items.map((item) => (
                      <div key={item.id} className="px-3 py-2.5">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-stone-700">{item.label}</p>
                            <p className="mt-0.5 break-words text-sm font-semibold text-stone-900">{item.value}</p>
                          </div>
                          <span className="shrink-0 text-[11px] text-stone-400">{formatShortDate(item.updatedAt)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <div className="mt-4 rounded-lg border border-dashed border-stone-200 bg-white/70 px-4 py-5 text-sm text-stone-500">
              No context added yet. Tap the chat button to add goals, habits, dietary preferences, or lifestyle context.
            </div>
          )}
        </section>
      </div>

      <button
        type="button"
        aria-label="Talk to profile"
        title="Talk to profile"
        onClick={() => setManagerOpen(true)}
        className="fixed right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-indigo-600 text-white shadow-lg transition-all duration-150 hover:bg-indigo-700 active:scale-95 sm:right-6"
        style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 6rem)" }}
      >
        <MessageCircle size={22} />
      </button>

      <ProfileManagerSheet
        open={managerOpen}
        onOpenChange={setManagerOpen}
        onSubmitted={({ profile: nextProfile, measurements: nextMeasurements }) => {
          setProfile((nextProfile as Profile | null) ?? null);
          setMeasurements(nextMeasurements);
        }}
      />
    </main>
  );
}

function ProfileRow({
  label,
  value,
  status,
  caption,
}: {
  label: string;
  value: string;
  status: string;
  caption?: string;
}) {
  const statusStyle =
    status === "Missing"
      ? "bg-amber-50 text-amber-800"
      : status === "Overridden"
        ? "bg-sky-50 text-sky-700"
        : status === "Estimated"
          ? "bg-stone-100 text-stone-700"
          : status === "Provided"
            ? "bg-emerald-50 text-emerald-700"
            : "bg-stone-100 text-stone-600";

  return (
    <div className="border-b border-stone-200 px-3 py-2.5 last:border-b-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-stone-700">{label}</p>
          {caption ? <p className="mt-0.5 text-xs text-stone-400">{caption}</p> : null}
        </div>
        <div className="min-w-0 text-right">
          <p className="break-words text-sm font-semibold text-stone-900">{value}</p>
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

function formatMeasurementType(value: string) {
  return value
    .split(/[_\s]+/)
    .filter(Boolean)
    .map(capitalize)
    .join(" ");
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatShortDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function formatMeasuredAt(value: string) {
  return new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
