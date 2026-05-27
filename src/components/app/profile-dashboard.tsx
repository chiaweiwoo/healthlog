"use client";

import { AlertCircle, Brain, CheckCircle2, MapPin, MessageCircle, UserRound } from "lucide-react";
import { useState } from "react";
import { InfoButton } from "@/components/app/info-button";
import { ProfileManagerSheet } from "@/components/app/profile-manager-sheet";
import { DEFAULT_COUNTRY } from "@/lib/config";
import {
  deriveBmr,
  deriveNeat,
  deriveWaterTarget,
  getMissingProfileEssentials,
  getProfileMemory,
  isProfileComplete,
} from "@/lib/profile-memory";
import type { Profile, ProfileMemoryItem } from "@/lib/schemas";

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

type EssentialFieldRow = {
  key: string;
  label: string;
  value: string | null;
  caption?: string;
};

type DerivedRow = {
  label: string;
  value: string;
  caption: string;
};

type MemorySection = {
  heading: string;
  items: ProfileMemoryItem[];
};

const activityLabels: Record<string, string> = {
  sedentary: "Minimal",
  light: "Desk / low movement",
  moderate: "Desk + errands",
  active: "On feet often",
  very_active: "Physical day",
};

export function ProfileDashboard({
  initialProfile,
  initialMeasurements,
}: {
  initialProfile: Profile | null;
  initialMeasurements: BodyMeasurement[];
}) {
  void initialMeasurements;
  const [profile, setProfile] = useState<Profile | null>(initialProfile);
  const [managerOpen, setManagerOpen] = useState(false);

  const profileComplete = isProfileComplete(profile);
  const missingEssentialKeys = new Set(getMissingProfileEssentials(profile).map((item) => item.key));
  const waterTarget = deriveWaterTarget(profile);
  const bmr = deriveBmr(profile);
  const neat = deriveNeat(profile);

  const essentialRows: EssentialFieldRow[] = [
    { key: "age", label: "Age", value: profile?.age ? String(profile.age) : null },
    { key: "sex", label: "Sex", value: profile?.sex ? capitalize(profile.sex) : null },
    { key: "heightCm", label: "Height", value: profile?.heightCm ? `${profile.heightCm} cm` : null },
    { key: "weightKg", label: "Weight", value: profile?.weightKg ? `${profile.weightKg} kg` : null },
    {
      key: "activityLevel",
      label: "Baseline lifestyle",
      value: profile?.activityLevel ? (activityLabels[profile.activityLevel] ?? profile.activityLevel) : null,
      caption: "Used for NEAT only, excluding explicitly logged exercise.",
    },
  ];

  const derivedRows: DerivedRow[] = [
    {
      label: "BMR",
      value: bmr.value != null ? `${bmr.value} kcal` : "Unavailable",
      caption: bmr.reason,
    },
    {
      label: "NEAT",
      value: neat.value != null ? `${neat.value} kcal` : "Unavailable",
      caption: neat.reason,
    },
    {
      label: "Water target",
      value: waterTarget.value != null ? `${waterTarget.value} ml/day` : "Unavailable",
      caption: waterTarget.reason,
    },
  ];

  const memorySections = buildMemorySections(getProfileMemory(profile));

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
                description="Daily needs your basics to estimate calorie output, hydration target, and analysis quality."
              />
            }
          />

          <div className="mt-4 space-y-2">
            {essentialRows.map((row) => (
              <EssentialChecklistRow
                key={row.key}
                label={row.label}
                value={row.value}
                caption={row.caption}
                missing={missingEssentialKeys.has(row.key as never)}
              />
            ))}
          </div>

          {profileComplete ? (
            <div className="mt-5 overflow-hidden rounded-lg border border-stone-200 bg-white/90">
              <div className="border-b border-stone-200 px-3 py-2.5">
                <p className="text-xs font-bold uppercase tracking-wide text-stone-500">Calculated targets</p>
              </div>
              <div className="divide-y divide-stone-200">
                {derivedRows.map((row) => (
                  <DerivedValueRow key={row.label} label={row.label} value={row.value} caption={row.caption} />
                ))}
              </div>
            </div>
          ) : null}
        </section>

        <section className="rounded-xl border border-stone-200 bg-stone-50/60 p-4 shadow-sm">
          <SectionHeader
            icon={<Brain size={18} className="text-indigo-500" />}
            iconBg="bg-indigo-50/70"
            caption="CONTEXT"
            title="Profile knowledge"
          />

          <div className="mt-3 overflow-hidden rounded-lg border border-stone-200 bg-white/90">
            <LocationRow country={profile?.country ?? DEFAULT_COUNTRY} city={profile?.city ?? null} />
            <div className="border-t border-stone-100" />
            <GoalRow value={profile?.goal?.trim() ? profile.goal : null} />
          </div>

          {memorySections.length ? (
            <div className="mt-4 space-y-3">
              {memorySections.map((section) => (
                <section key={section.heading} className="overflow-hidden rounded-lg border border-stone-200 bg-white/90">
                  <div className="border-b border-stone-200 px-3 py-2">
                    <p className="text-xs font-bold uppercase tracking-wide text-stone-500">{section.heading}</p>
                  </div>
                  <div className="divide-y divide-stone-200">
                    {section.items.map((item) => (
                      <div key={item.id} className="px-3 py-3">
                        <p className="text-sm font-medium text-stone-700">{item.label}</p>
                        <p className="mt-1 break-words text-sm text-stone-900">{item.value}</p>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <div className="mt-4 rounded-lg border border-dashed border-stone-200 bg-white/70 px-4 py-5 text-sm leading-relaxed text-stone-500">
              No health context added yet. Use the chat button for goals, medication, injuries, dietary restrictions, lifestyle, or exercise limits that affect analysis.
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
        onSubmitted={({ profile: nextProfile }) => {
          setProfile((nextProfile as Profile | null) ?? null);
        }}
      />
    </main>
  );
}

function EssentialChecklistRow({
  label,
  value,
  caption,
  missing,
}: {
  label: string;
  value: string | null;
  caption?: string;
  missing: boolean;
}) {
  return (
    <div className="rounded-lg border border-stone-200 bg-white/90 px-3 py-3">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 shrink-0">
          {missing ? (
            <AlertCircle size={16} className="text-amber-600" />
          ) : (
            <CheckCircle2 size={16} className="text-emerald-600" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
            <p className="text-sm font-medium text-stone-800">{label}</p>
            <p className={`break-words text-sm ${missing ? "text-stone-400" : "font-semibold text-stone-900"}`}>
              {value ?? "Missing"}
            </p>
          </div>
          {caption ? <p className="mt-1 text-xs leading-relaxed text-stone-400">{caption}</p> : null}
        </div>
      </div>
    </div>
  );
}

function DerivedValueRow({
  label,
  value,
  caption,
}: {
  label: string;
  value: string;
  caption: string;
}) {
  return (
    <div className="px-3 py-3">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
        <p className="text-sm font-medium text-stone-700">{label}</p>
        <p className="break-words text-sm font-semibold text-stone-900">{value}</p>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-stone-400">{caption}</p>
    </div>
  );
}

function LocationRow({ country, city }: { country: string; city: string | null }) {
  const isDefault = country === DEFAULT_COUNTRY && city === null;
  const displayValue = city ? `${city}, ${country}` : country;

  return (
    <div className="px-3 py-3">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
        <div className="flex shrink-0 items-center gap-1.5">
          <MapPin size={13} className="shrink-0 text-stone-400" />
          <p className="text-sm font-medium text-stone-700">Location</p>
        </div>
        <p className={`break-words text-sm ${isDefault ? "text-stone-400" : "font-semibold text-stone-900"}`}>
          {displayValue}
          {isDefault ? <span className="italic"> (default)</span> : null}
        </p>
      </div>
      {isDefault ? (
        <p className="mt-1.5 text-xs leading-relaxed text-stone-400">
          Defaulting to {DEFAULT_COUNTRY}. Tell the assistant if you live elsewhere — e.g. &ldquo;I&rsquo;m based in Tokyo&rdquo;.
        </p>
      ) : null}
    </div>
  );
}

function GoalRow({ value }: { value: string | null }) {
  return (
    <div className="px-3 py-3">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
        <p className="text-sm font-medium text-stone-700">Goal</p>
        <p className={`break-words text-sm ${value ? "font-semibold text-stone-900" : "text-stone-400"}`}>{value ?? "Not set"}</p>
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
      <div className="flex min-w-0 items-center gap-3">
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-stone-200/60 ${iconBg}`}>
          {icon}
        </div>
        <div className="min-w-0">
          <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400">{caption}</span>
          <p className="text-base font-bold leading-tight text-stone-900">{title}</p>
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

function buildMemorySections(items: ProfileMemoryItem[]): MemorySection[] {
  const sectionMap = new Map<string, ProfileMemoryItem[]>();

  for (const item of items) {
    const heading = getMemoryHeading(item);
    const list = sectionMap.get(heading) ?? [];
    list.push(item);
    sectionMap.set(heading, list);
  }

  const sectionOrder = [
    "Medical context",
    "Medication / Supplement",
    "Injury / Limitation",
    "Exercise context",
    "Diet preference",
    "Lifestyle",
    "Other health context",
  ];

  return sectionOrder
    .map((heading) => {
      const sectionItems = sectionMap.get(heading) ?? [];
      return sectionItems.length ? { heading, items: sectionItems } : null;
    })
    .filter((section): section is MemorySection => section !== null);
}

function getMemoryHeading(item: ProfileMemoryItem) {
  const text = `${item.label} ${item.value}`.toLowerCase();

  if (/(medication|medicine|meds|supplement|vitamin|tablet|pill)/.test(text)) return "Medication / Supplement";
  if (/(injury|injured|pain|sprain|fracture|limitation|limit|physio|recovery)/.test(text)) return "Injury / Limitation";
  if (item.category === "medical_context") return "Medical context";
  if (item.category === "exercise_context") return "Exercise context";
  if (item.category === "diet" || item.category === "food_context" || /(allergy|restrict|avoid|diet|food|vegetarian|vegan|halal)/.test(text)) {
    return "Diet preference";
  }
  if (item.category === "lifestyle" || item.category === "preference") return "Lifestyle";
  return "Other health context";
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
