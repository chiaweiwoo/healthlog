"use client";

import { format } from "date-fns";
import {
  ChevronDown,
  Droplets,
  Flame,
  NotebookPen,
  Pencil,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { useEffect, useState, useSyncExternalStore, useTransition } from "react";
import { toast } from "sonner";
import { DatePickerDialog } from "@/components/app/date-picker-dialog";
import { EntryDetailDialog } from "@/components/app/entry-detail-dialog";
import { FullTextDialog } from "@/components/app/full-text-dialog";
import { InfoButton } from "@/components/app/info-button";
import { NutritionIcons } from "@/components/app/nutrition-icons";
import { QuickNoteSheet } from "@/components/app/quick-note-sheet";
import { WarningDot } from "@/components/app/warning-dot";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip } from "@/components/ui/tooltip";
import { atwaterFactors, getDisplayNutrition, getOutputBreakdown, thermicEffectRates } from "@/lib/calculations";
import type { Profile } from "@/lib/schemas";

type Warning = { code: string; message: string; improveWith?: string };

type EntryItem = {
  kind: "food" | "water" | "exercise" | "note";
  label: string;
  quantity?: string | null;
  confidence: number;
  waterMl?: number | null;
  exerciseCalories?: number | null;
  nutrition?: {
    calories: number | null;
    proteinG: number | null;
    fatG: number | null;
    carbsG: number | null;
    alcoholG: number | null;
  };
  warnings?: Warning[];
  remarks?: string | null;
  sourceCreatedAt?: string;
  sourceEntryId?: string;
  sourceOccurredTime?: string | null;
  sourceRawNote?: string;
};

type Entry = {
  id: string;
  raw_note: string;
  occurred_time: string | null;
  parsed_items: EntryItem[];
  confidence: number;
  warnings: Warning[];
  remarks: string | null;
  parse_status: "pending" | "parsed" | "failed";
  parse_error: string | null;
  is_active: boolean;
  created_at: string;
};

type Summary = {
  calories: number;
  protein_g: number;
  fat_g: number;
  carbs_g: number;
  alcohol_g: number;
  water_ml: number;
  exercise_calories: number;
  bmr: number | null;
  base_tdee: number | null;
  baseline_activity_calories?: number | null;
  tef_calories?: number | null;
  tdee: number | null;
  estimated_deficit: number | null;
  confidence: number;
  warnings: Warning[];
  breakdown: {
    food?: EntryItem[];
    water?: EntryItem[];
    exercise?: EntryItem[];
    notes?: EntryItem[];
    meta?: {
      foodItemCount?: number;
      unknownCaloriesCount?: number;
      unknownMacroCount?: number;
      caloriesIncomplete?: boolean;
      macrosIncomplete?: boolean;
      unparsedEntryCount?: number;
    };
  };
} | null;

function getLocalDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateOnly(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
}

function hasWarningCode(warnings: Warning[] | undefined, code: string) {
  return warnings?.some((warning) => warning.code === code) ?? false;
}

function getItemNutritionData(item: EntryItem) {
  const derived = getDisplayNutrition(item);
  return {
    calories: derived.calories,
    proteinG: derived.proteinG,
    fatG: derived.fatG,
    carbsG: derived.carbsG,
    alcoholG: derived.alcoholG,
    waterMl: item.waterMl,
  };
}

function getDeficitDisplayTitle(summary: Summary) {
  if (!summary) return "0 kcal";
  if (hasWarningCode(summary.warnings, "profile_incomplete") || hasWarningCode(summary.warnings, "activity_missing")) {
    return "Profile needed";
  }
  if (summary.breakdown.meta?.caloriesIncomplete || (summary.breakdown.meta?.unparsedEntryCount ?? 0) > 0) {
    return "Incomplete data";
  }
  if (summary.estimated_deficit == null) {
    return "Incomplete data";
  }
  if (summary.estimated_deficit < 0) {
    return `${Math.abs(summary.estimated_deficit)} kcal Surplus`;
  }
  return `${summary.estimated_deficit} kcal Deficit`;
}

function getDeficitTone(summary: Summary) {
  if (!summary || summary.estimated_deficit === null) return "border-stone-200 bg-stone-50/40 text-stone-900";
  return summary.estimated_deficit < 0
    ? "border-amber-200 bg-amber-50/40 text-amber-950"
    : "border-emerald-200 bg-emerald-50/40 text-emerald-950";
}

function getEntryHeadline(entry: Entry) {
  if (entry.parsed_items.length) {
    return entry.parsed_items.map((item) => item.label).join(" | ");
  }
  if (entry.parse_status === "pending") return "Parsing note";
  if (entry.parse_status === "failed") return "Needs clarification";
  return "Recorded note";
}

function getEntryStatusTone(entry: Entry) {
  if (!entry.is_active) return "border-stone-200 bg-stone-50/30 opacity-60 shadow-xs";
  if (entry.parse_status === "failed") return "border-amber-200 bg-amber-50/20 text-amber-950 shadow-xs";
  if (entry.parse_status === "pending") return "border-stone-200 bg-stone-50/30 text-stone-900 shadow-xs animate-pulse";
  return "border-stone-200/80 bg-white/95 text-stone-900 shadow-xs hover:shadow-md hover:border-stone-300 transition-all duration-200";
}

function getPercent(value: number | null | undefined, total: number | null | undefined) {
  if (value == null || total == null || total <= 0) return null;
  return Math.round((value / total) * 100);
}

export function DailyDashboard({
  initialDate,
  initialEntries,
  initialSummary,
  profile,
}: {
  initialDate: string;
  initialEntries: Entry[];
  initialSummary: Summary;
  profile: Profile | null;
}) {
  const browserToday = useSyncExternalStore(
    () => () => {},
    getLocalDateString,
    () => initialDate,
  );
  const [selectedDateOverride, setSelectedDateOverride] = useState<string | null>(null);
  const [entries, setEntries] = useState(initialEntries);
  const [summary, setSummary] = useState<Summary>(initialSummary);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editNote, setEditNote] = useState("");
  const [isPending, startTransition] = useTransition();
  const [caloriesDetailOpen, setCaloriesDetailOpen] = useState(false);
  const [quickNoteOpen, setQuickNoteOpen] = useState(false);
  const [recordDatesVersion, setRecordDatesVersion] = useState(0);
  const selectedDate = selectedDateOverride ?? browserToday;

  useEffect(() => {
    if (selectedDate === initialDate && selectedDateOverride === null) return;
    const toastId = toast.loading(`Loading entries for ${selectedDate}...`);
    startTransition(async () => {
      try {
        const response = await fetch(`/api/daily-entries?date=${selectedDate}`);
        if (!response.ok) throw new Error("Could not load entries.");
        const body = (await response.json()) as { entries: Entry[]; summary: Summary };
        setEntries(body.entries ?? []);
        setSummary(body.summary ?? null);
        toast.success(`Loaded entries for ${selectedDate}`, { id: toastId });
      } catch {
        toast.error(`Could not load entries for ${selectedDate}`, { id: toastId });
      }
    });
  }, [initialDate, selectedDate, selectedDateOverride]);

  async function saveEdit(id: string) {
    const rawNote = editNote.trim();
    if (!rawNote) return;
    const toastId = toast.loading("Saving edit...");
    try {
      const response = await fetch("/api/daily-entries", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, rawNote }),
      });
      const body = (await response.json().catch(() => null)) as
        | { entry?: Entry; summary?: Summary; error?: string; requestId?: string }
        | null;
      if (!response.ok || !body?.entry) {
        const errorMsg = body?.requestId ? `${body.error ?? "Could not update note."} (${body.requestId})` : (body?.error ?? "Could not update note.");
        toast.error(errorMsg, { id: toastId });
        return;
      }
      setEntries((current) => current.map((entry) => (entry.id === id ? body.entry! : entry)));
      if (body.entry.parse_status === "failed") {
        toast.warning("Saved, but parsing failed.", { id: toastId });
      } else {
        toast.success("Entry updated.", { id: toastId });
      }
      setSummary(body.summary ?? null);
      setEditingId(null);
      setEditNote("");
    } catch {
      toast.error("Could not update note.", { id: toastId });
    }
  }

  async function removeEntry(id: string) {
    const toastId = toast.loading("Deleting entry...");
    try {
      const response = await fetch(`/api/daily-entries?id=${id}`, { method: "DELETE" });
      const body = (await response.json().catch(() => null)) as
        | { summary: Summary; error?: string; requestId?: string }
        | null;
      if (!response.ok) {
        const errorMsg = body?.requestId ? `${body.error ?? "Could not delete note."} (${body.requestId})` : (body?.error ?? "Could not delete note.");
        toast.error(errorMsg, { id: toastId });
        return;
      }
      setEntries((current) => current.filter((entry) => entry.id !== id));
      setSummary(body?.summary ?? null);
      setRecordDatesVersion((current) => current + 1);
      toast.success("Entry deleted.", { id: toastId });
    } catch {
      toast.error("Could not delete note.", { id: toastId });
    }
  }

  function requestDeleteEntry(id: string) {
    toast("Are you sure you want to delete this entry?", {
      action: {
        label: "Confirm",
        onClick: () => startTransition(() => removeEntry(id)),
      },
      duration: 8000,
    });
  }

  const output = getOutputBreakdown({
    bmr: summary?.bmr ?? null,
    baseTdee: summary?.base_tdee ?? null,
    exerciseCalories: summary?.exercise_calories ?? 0,
    proteinG: summary?.protein_g ?? 0,
    fatG: summary?.fat_g ?? 0,
    carbsG: summary?.carbs_g ?? 0,
    alcoholG: summary?.alcohol_g ?? 0,
  });

  const intakeBreakdown = {
    proteinCalories: Math.round((summary?.protein_g ?? 0) * atwaterFactors.protein),
    fatCalories: Math.round((summary?.fat_g ?? 0) * atwaterFactors.fat),
    carbsCalories: Math.round((summary?.carbs_g ?? 0) * atwaterFactors.carbs),
    alcoholCalories: Math.round((summary?.alcohol_g ?? 0) * atwaterFactors.alcohol),
    totalCalories: summary?.calories ?? 0,
  };

  const targetWaterMl = profile?.weightKg
    ? Math.round(profile.weightKg * 35)
    : (profile?.sex === "male" ? 3000 : profile?.sex === "female" ? 2200 : 2500);

  const currentWaterMl = summary?.water_ml ?? 0;
  const pct = targetWaterMl > 0 ? Math.round((currentWaterMl / targetWaterMl) * 100) : 0;
  const hydrationStatus = pct >= 90 ? "optimal" : pct >= 50 ? "moderate" : "low";

  const cardStyle =
    hydrationStatus === "optimal"
      ? "border-emerald-200 bg-emerald-50/40 text-emerald-950 shadow-sm"
      : hydrationStatus === "moderate"
        ? "border-sky-200 bg-sky-50/40 text-sky-950 shadow-sm"
        : "border-rose-200/80 bg-rose-50/30 text-rose-950 shadow-sm";

  const progressStyle =
    hydrationStatus === "optimal"
      ? "bg-gradient-to-r from-emerald-400 to-teal-500"
      : hydrationStatus === "moderate"
        ? "bg-gradient-to-r from-sky-400 to-blue-500"
        : "bg-gradient-to-r from-amber-400 to-rose-500";

  const statusLabel =
    hydrationStatus === "optimal"
      ? "Optimal Hydration"
      : hydrationStatus === "moderate"
        ? "Moderate Hydration"
        : "Low Hydration / Dehydrated";

  const energyStatus = summary && summary.estimated_deficit !== null
    ? (summary.estimated_deficit < 0 ? "surplus" : "deficit")
    : "empty";

  const energyIconColor =
    energyStatus === "deficit"
      ? "text-emerald-500"
      : energyStatus === "surplus"
        ? "text-amber-500 animate-pulse"
        : "text-stone-400";

  return (
    <main className="mx-auto max-w-2xl px-3 py-4 pb-28 sm:px-4 sm:py-6">
      <div className="space-y-4">

        {/* Header: date + Today button + date picker */}
        <div className="flex items-center justify-between gap-3 py-1.5 md:py-2">
          <h2 className="text-xl font-bold tracking-tight text-stone-900 font-sans">
            {format(parseDateOnly(selectedDate), "EEEE, d MMM yyyy")}
          </h2>
          <div className="flex items-center gap-2">
            <Tooltip content={<p>Back to today</p>}>
              <button
                type="button"
                aria-label="Back to today"
                onClick={() => setSelectedDateOverride(null)}
                disabled={selectedDate === browserToday || isPending}
                className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-stone-200 bg-white text-stone-500 shadow-sm transition-colors hover:bg-stone-50 hover:text-stone-900 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <RotateCcw size={14} />
              </button>
            </Tooltip>
            <DatePickerDialog
              value={selectedDate}
              onChange={(value) => setSelectedDateOverride(value)}
              refreshKey={recordDatesVersion}
              disabled={isPending}
            />
          </div>
        </div>

        {/* 1. CALORIES */}
        <section className={`rounded-xl border p-5 ${getDeficitTone(summary)} transition-all duration-300 shadow-sm`}>
          {/* Headline row */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/80 shadow-xs border border-stone-200/20">
                <Flame size={18} className={energyIconColor} />
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-stone-500/70">Daily Energy Balance</span>
                <h3 className="text-xl font-bold tracking-tight text-stone-900 mt-0.5">
                  {getDeficitDisplayTitle(summary)}
                </h3>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <InfoButton
                title="How deficit is calculated"
                description={
                  <div className="space-y-2">
                    <p>Your energy balance is calculated as **Quota (TDEE)** minus **In (Intake)**.</p>
                    <ul className="list-disc pl-4 space-y-1">
                      <li><strong>Deficit (Green)</strong>: You spent more energy than you consumed. Aligns with weight loss.</li>
                      <li><strong>Surplus (Amber)</strong>: You consumed more energy than you spent. Aligns with weight gain.</li>
                    </ul>
                  </div>
                }
              />
            </div>
          </div>

          {/* In / Quota row */}
          <div className="grid grid-cols-2 gap-4 border-t border-stone-200/40 pt-4 mt-4">
            <div className="text-left">
              <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400">In (Intake)</span>
              <p className="mt-0.5 text-lg font-bold text-stone-800">
                {summary ? `${summary.calories}` : "0"}{" "}
                <span className="text-xs font-normal text-stone-500 font-sans">kcal</span>
              </p>
            </div>
            <div className="border-l border-stone-200/40 pl-4 text-left">
              <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400">Quota (TDEE)</span>
              <p className="mt-0.5 text-lg font-bold text-stone-800">
                {summary?.tdee != null ? `${summary.tdee}` : "—"}{" "}
                <span className="text-xs font-normal text-stone-500 font-sans">kcal</span>
              </p>
            </div>
          </div>

          {/* Breakdown toggle */}
          <div className="flex justify-end mt-2">
            <button
              type="button"
              aria-label={caloriesDetailOpen ? "Hide breakdown" : "Show breakdown"}
              onClick={() => setCaloriesDetailOpen((v) => !v)}
              className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-full text-stone-400 transition hover:bg-stone-100/60 hover:text-stone-600"
            >
              <ChevronDown
                size={14}
                className={`transition-transform duration-200 ${caloriesDetailOpen ? "rotate-180" : ""}`}
              />
            </button>
          </div>

          {/* Collapsible: Intake + Quota details */}
          {caloriesDetailOpen && (
            <div className="space-y-3 pt-3">
              {/* Intake details */}
              <section className="rounded-xl border border-stone-200 bg-stone-50/35 p-4 shadow-xs">
                <div className="flex items-center justify-between gap-2 mb-3">
                  <InfoButton
                    className="inline-flex h-auto w-auto items-center bg-transparent p-0 text-left hover:bg-transparent justify-start rounded-none"
                    title="How intake is calculated"
                    description={
                      <>
                        <p>Intake calories come from the general Atwater system when macro grams are available.</p>
                        <ul className="list-disc space-y-1 pl-4 mt-1">
                          <li>Protein: {atwaterFactors.protein} kcal per gram</li>
                          <li>Fat: {atwaterFactors.fat} kcal per gram</li>
                          <li>Carbs: {atwaterFactors.carbs} kcal per gram</li>
                          <li>Alcohol: {atwaterFactors.alcohol} kcal per gram</li>
                        </ul>
                        <p className="mt-1">Water is counted from drinks and water entries that include liquid volume.</p>
                      </>
                    }
                  >
                    <span className="text-sm font-bold text-stone-900 border-b border-dashed border-stone-300 hover:border-stone-500 cursor-pointer select-none">
                      Calories Intake
                    </span>
                  </InfoButton>
                </div>
                <div className="overflow-hidden rounded-lg border border-stone-200 bg-white/90">
                  <MetricRow
                    label="Calories"
                    value={`${summary?.calories ?? 0} kcal`}
                    info="Intake calories are the known total from food and drinks."
                    caption={summary?.breakdown.meta?.caloriesIncomplete ? "Known total so far" : "Known total"}
                  />
                  <MetricRow
                    label="Protein"
                    value={`${summary?.protein_g ?? 0} g`}
                    info="Protein contributes 4 kcal per gram and also drives a higher thermic effect."
                    detail={`${intakeBreakdown.proteinCalories} kcal`}
                    percent={getPercent(intakeBreakdown.proteinCalories, intakeBreakdown.totalCalories)}
                    progressStyle="bg-gradient-to-r from-orange-400 to-amber-500"
                    subordinate
                  />
                  <MetricRow
                    label="Fat"
                    value={`${summary?.fat_g ?? 0} g`}
                    info="Fat contributes 9 kcal per gram and a smaller thermic effect."
                    detail={`${intakeBreakdown.fatCalories} kcal`}
                    percent={getPercent(intakeBreakdown.fatCalories, intakeBreakdown.totalCalories)}
                    progressStyle="bg-gradient-to-r from-yellow-400 to-amber-500"
                    subordinate
                  />
                  <MetricRow
                    label="Carbs"
                    value={`${summary?.carbs_g ?? 0} g`}
                    info="Carbohydrates contribute 4 kcal per gram."
                    detail={`${intakeBreakdown.carbsCalories} kcal`}
                    percent={getPercent(intakeBreakdown.carbsCalories, intakeBreakdown.totalCalories)}
                    progressStyle="bg-gradient-to-r from-cyan-400 to-sky-500"
                    subordinate
                  />
                  <MetricRow
                    label="Alcohol"
                    value={`${summary?.alcohol_g ?? 0} g`}
                    info="Alcohol contributes 7 kcal per gram when present."
                    detail={`${intakeBreakdown.alcoholCalories} kcal`}
                    percent={getPercent(intakeBreakdown.alcoholCalories, intakeBreakdown.totalCalories)}
                    progressStyle="bg-gradient-to-r from-purple-400 to-violet-500"
                    subordinate
                  />
                </div>
              </section>

              {/* Quota details */}
              <section className="rounded-xl border border-stone-200 bg-stone-50/35 p-4 shadow-xs">
                <div className="flex items-center justify-between gap-2 mb-3">
                  <InfoButton
                    className="inline-flex h-auto w-auto items-center bg-transparent p-0 text-left hover:bg-transparent justify-start rounded-none"
                    title="How quota is calculated"
                    description={
                      <>
                        <p>BMR uses the Mifflin-St Jeor formula from your body profile.</p>
                        <p className="mt-1">NEAT comes from your chosen baseline lifestyle and represents conservative non-exercise movement only.</p>
                        <p className="mt-1">TEF uses a macro-based estimate:</p>
                        <ul className="list-disc space-y-1 pl-4 mt-1">
                          <li>Protein: {Math.round(thermicEffectRates.protein * 100)}%</li>
                          <li>Carbs: {Math.round(thermicEffectRates.carbs * 100)}%</li>
                          <li>Fat: {Math.round(thermicEffectRates.fat * 100)}%</li>
                          <li>Alcohol: {Math.round(thermicEffectRates.alcohol * 100)}%</li>
                        </ul>
                        <p className="mt-1">TDEE is calculated as BMR + NEAT + TEF + EAT.</p>
                      </>
                    }
                  >
                    <span className="text-sm font-bold text-stone-900 border-b border-dashed border-stone-300 hover:border-stone-500 cursor-pointer select-none">
                      Calories Quota
                    </span>
                  </InfoButton>
                </div>
                <div className="overflow-hidden rounded-lg border border-stone-200 bg-white/90">
                  <MetricRow
                    label="TDEE"
                    value={summary?.tdee != null ? `${summary.tdee} kcal` : "Profile needed"}
                    info="Total Daily Energy Expenditure is the app's estimate of your daily energy out."
                    strong
                  />
                  <MetricRow
                    label="BMR"
                    value={summary?.bmr != null ? `${summary.bmr} kcal` : "Profile needed"}
                    info="Basal Metabolic Rate is the calories your body uses at rest."
                    percent={getPercent(output.bmr, output.totalTdee)}
                    progressStyle="bg-gradient-to-r from-blue-400 to-indigo-500"
                    subordinate
                  />
                  <MetricRow
                    label="NEAT"
                    value={output.baselineActivityCalories != null ? `${output.baselineActivityCalories} kcal` : "Profile needed"}
                    info="Non-Exercise Activity Thermogenesis is estimated from your baseline lifestyle and excludes runs, gym, deliberate step sessions, and other explicitly logged exercise."
                    percent={getPercent(output.baselineActivityCalories, output.totalTdee)}
                    progressStyle="bg-gradient-to-r from-violet-400 to-fuchsia-500"
                    subordinate
                  />
                  <MetricRow
                    label="TEF"
                    value={`${output.tefCalories} kcal`}
                    info="Thermic Effect of Food is estimated dynamically from today's protein, carbs, fat, and alcohol intake."
                    percent={getPercent(output.tefCalories, output.totalTdee)}
                    progressStyle="bg-gradient-to-r from-emerald-400 to-teal-500"
                    subordinate
                  />
                  <MetricRow
                    label="EAT"
                    value={`${summary?.exercise_calories ?? 0} kcal`}
                    info="Exercise Activity Thermogenesis comes from your explicitly logged exercise entries."
                    percent={getPercent(summary?.exercise_calories ?? 0, output.totalTdee)}
                    progressStyle="bg-gradient-to-r from-rose-500 to-orange-500"
                    subordinate
                  />
                </div>
              </section>
            </div>
          )}
        </section>

        {/* 2. WATER */}
        <section className={`rounded-xl border p-4 ${cardStyle} transition-all duration-300 shadow-sm space-y-3`}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/80 shadow-sm border border-stone-200/20 text-sky-500">
                <Droplets size={18} className="animate-pulse" />
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-stone-500/70">Daily Hydration</span>
                <h4 className="text-sm font-bold text-stone-900 leading-tight">Water Intake</h4>
              </div>
            </div>
            <InfoButton
              title="Daily Hydration Recommendations"
              description={
                <div className="space-y-2 text-stone-750">
                  <p>Proper hydration is essential for cellular function, digestion, energy levels, and overall wellness.</p>
                  <p><strong>Your recommendation:</strong></p>
                  <ul className="list-disc pl-4 space-y-1 text-xs">
                    {profile?.weightKg ? (
                      <li>Based on your body profile weight of <strong>{profile.weightKg} kg</strong>, your recommended water target is scaled at 35 ml/kg: <strong>{targetWaterMl} ml</strong> per day.</li>
                    ) : (
                      <li>Set up your body profile details (weight, sex) in the <strong>Body</strong> tab to get a personalized recommendation scaled at 35 ml/kg of body weight.</li>
                    )}
                    <li>Standard fallback targets: 3,000 ml for men, 2,200 ml for women, and 2,500 ml general baseline.</li>
                  </ul>
                  <p className="text-xs text-stone-500 mt-1">Note: Water contribution is counted from pure water entries as well as the liquid volume of calorie-bearing drinks (e.g. teas, juice, milk).</p>
                </div>
              }
            />
          </div>

          <div className="space-y-2 pt-1">
            <div className="flex justify-between items-baseline">
              <p className="text-sm font-semibold text-stone-850">
                {currentWaterMl.toLocaleString()} <span className="text-xs font-normal text-stone-500">ml logged ({pct}%)</span>
              </p>
              <p className="text-xs font-medium text-stone-500">
                {statusLabel} • Target: {targetWaterMl.toLocaleString()} ml
              </p>
            </div>
            <div className="h-3 w-full rounded-full bg-white/60 overflow-hidden shadow-inner border border-stone-200/20">
              <div
                className={`h-full rounded-full transition-all duration-500 ease-out ${progressStyle}`}
                style={{ width: `${Math.min(pct, 100)}%` }}
              />
            </div>
          </div>
        </section>

        {/* 3. ENTRIES */}
        <section className="space-y-3">
          <div className="flex items-center gap-2.5 px-1 py-1.5">
            <h3 className="text-lg font-bold text-stone-900 font-sans tracking-tight">Today&apos;s Entries</h3>
            {entries.length > 0 && (
              <span className="inline-flex h-5 items-center justify-center rounded-full bg-stone-100 px-2.5 text-[10px] font-bold text-stone-500 border border-stone-200/50 shadow-xs">
                {entries.length}
              </span>
            )}
          </div>

          {entries.length ? (
            entries.map((entry) => {
              const isEditing = editingId === entry.id;
              return (
                <article key={entry.id} className={`rounded-xl border p-4 ${getEntryStatusTone(entry)}`}>
                  <div className="flex items-start justify-between gap-2">
                    {/* Title + timestamp stacked — flex-1 so it gets all leftover space */}
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <EntryDetailDialog
                          entry={entry}
                          trigger={
                            <button type="button" className="min-w-0">
                              <span className="block overflow-hidden text-ellipsis whitespace-nowrap text-left text-sm font-bold text-stone-900">
                                {getEntryHeadline(entry)}
                              </span>
                            </button>
                          }
                        />
                        {entry.parse_status === "parsed" ? null : <StatusBadge status={entry.parse_status} />}
                        <WarningDot warnings={entry.warnings} label="Entry warnings" />
                      </div>
                      <p className="mt-1 text-xs font-semibold text-stone-400 font-sans">
                        {entry.occurred_time ?? format(new Date(entry.created_at), "p")}
                      </p>
                    </div>
                    {/* Action icons on the right */}
                    <div className="flex shrink-0 items-center gap-0.5">
                      {entry.is_active ? (
                        <>
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label="Edit note"
                            disabled={isPending}
                            onClick={() => {
                              setEditingId(entry.id);
                              setEditNote(entry.raw_note);
                            }}
                            className="h-7 w-7 rounded-lg text-stone-500 hover:text-stone-900 hover:bg-stone-100 transition cursor-pointer"
                          >
                            <Pencil size={14} />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label="Delete note"
                            disabled={isPending}
                            onClick={() => requestDeleteEntry(entry.id)}
                            className="h-7 w-7 rounded-lg text-stone-500 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                          >
                            <Trash2 size={14} />
                          </Button>
                        </>
                      ) : null}
                    </div>
                  </div>

                  {isEditing ? (
                    <div className="mt-3 space-y-2.5">
                      <Textarea
                        value={editNote}
                        onChange={(event) => setEditNote(event.target.value)}
                        disabled={isPending}
                        className="bg-white border-stone-200 rounded-lg text-sm resize-none h-20"
                      />
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => startTransition(() => saveEdit(entry.id))}
                          disabled={isPending || !editNote.trim()}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold px-3 py-1.5 cursor-pointer disabled:opacity-50"
                        >
                          Save
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setEditingId(null)}
                          disabled={isPending}
                          className="border-stone-200 text-stone-700 hover:bg-stone-50 rounded-lg text-xs font-semibold px-3 py-1.5 cursor-pointer"
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {entry.parsed_items.length ? (
                        entry.parsed_items.length === 1 ? (
                          <div className="mt-1">
                            {entry.parsed_items[0].kind === "exercise" ? (
                              <p className="text-xs font-medium text-stone-500 leading-relaxed">
                                {entry.parsed_items[0].exerciseCalories != null
                                  ? `${entry.parsed_items[0].exerciseCalories} kcal burn`
                                  : "Exercise recorded"}
                              </p>
                            ) : (
                              <NutritionIcons data={getItemNutritionData(entry.parsed_items[0])} />
                            )}
                            {entry.parsed_items[0].remarks && (
                              <p className="mt-1 text-[11px] text-stone-400 italic font-medium">
                                Remarks: {entry.parsed_items[0].remarks}
                              </p>
                            )}
                          </div>
                        ) : (
                          <div className="mt-3 space-y-2">
                            {entry.parsed_items.map((item, index) => (
                              <div key={`${entry.id}-${index}`} className="rounded-lg bg-stone-50/60 border border-stone-200/40 px-3 py-2 shadow-xs transition hover:bg-stone-50 duration-150">
                                <div className="flex items-start justify-between gap-2">
                                  <FullTextDialog
                                    title="Parsed item"
                                    text={item.label}
                                    className="min-w-0 flex-1"
                                    previewClassName="break-words text-sm font-semibold text-stone-900"
                                  />
                                  <WarningDot warnings={item.warnings} label={`${item.label} warnings`} className="-mt-0.5 shrink-0" />
                                </div>
                                <div className="mt-1">
                                  {item.kind === "exercise" ? (
                                    <p className="text-xs font-medium text-stone-500">
                                      {item.exerciseCalories != null
                                        ? `${item.exerciseCalories} kcal burn`
                                        : "Exercise recorded"}
                                    </p>
                                  ) : (
                                    <NutritionIcons data={getItemNutritionData(item)} />
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )
                      ) : (
                        <p className="mt-3 rounded-lg bg-stone-50/40 border border-stone-200/30 px-3 py-2 text-xs font-medium text-stone-500 leading-relaxed">
                          {entry.parse_status === "failed" ? "Saved, but this note still needs clarification before it can be structured." : "Awaiting structured result."}
                        </p>
                      )}
                      {entry.parse_status === "failed" && (
                        <p className="mt-3 rounded-lg bg-stone-50/40 border border-stone-200/30 px-3 py-2 text-xs font-medium text-stone-500 leading-relaxed break-words">
                          {entry.raw_note}
                        </p>
                      )}
                    </>
                  )}
                </article>
              );
            })
          ) : (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-stone-200 bg-stone-50/30 p-8 text-center shadow-xs">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-xs border border-stone-200/20 text-stone-400">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                  className="h-5 w-5"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5m-9-6h.008v.008H12v-.008zM12 15h.008v.008H12V15zm0 2.25h.008v.008H12v-.008zM9.75 15h.008v.008H9.75V15zm0 2.25h.008v.008H9.75v-.008zM7.5 15h.008v.008H7.5V15zm0 2.25h.008v.008H7.5v-.008zm6.75-4.5h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008V15zm0 2.25h.008v.008h-.008v-.008zm2.25-4.5h.008v.008H16.5v-.008zm0 2.25h.008v.008H16.5V15z"
                  />
                </svg>
              </div>
              <p className="mt-3 text-sm font-bold text-stone-900 font-sans tracking-tight">No records yet today</p>
              <p className="mt-1 text-xs font-medium text-stone-500 max-w-[200px] font-sans">
                Use the floating button to log meals, drinks, or workouts.
              </p>
            </div>
          )}
        </section>

      </div>

      {/* FAB */}
      <button
        type="button"
        aria-label="Add note"
        onClick={() => setQuickNoteOpen(true)}
        className="fixed right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-600 text-white shadow-lg hover:bg-emerald-700 active:scale-95 transition-all duration-150 sm:right-6"
        style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 6rem)" }}
      >
        <NotebookPen size={22} />
      </button>

      {/* Quick note sheet */}
      <QuickNoteSheet
        open={quickNoteOpen}
        onOpenChange={setQuickNoteOpen}
        selectedDate={selectedDate}
        disabled={isPending}
        onSubmitted={(entry, summary) => {
          setEntries((current) => [entry as Entry, ...current.filter((e) => e.id !== entry.id)]);
          setSummary(summary as Summary);
          setRecordDatesVersion((v) => v + 1);
        }}
      />
    </main>
  );
}

function MetricRow({
  label,
  value,
  info,
  caption,
  detail,
  percent,
  strong = false,
  subordinate = false,
  progressStyle,
}: {
  label: string;
  value: string;
  info: string;
  caption?: string;
  detail?: string;
  percent?: number | null;
  strong?: boolean;
  subordinate?: boolean;
  progressStyle?: string;
}) {
  return (
    <div className={`border-b border-stone-200 px-3 py-2.5 last:border-b-0 ${subordinate ? "bg-stone-50/55" : ""}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className={`min-w-0 ${subordinate ? "pl-3" : ""}`}>
            <InfoButton
              className="inline-flex h-auto w-auto items-center bg-transparent p-0 text-left hover:bg-transparent justify-start rounded-none"
              title={label}
              description={<p>{info}</p>}
            >
              <span className={`text-sm select-none border-b border-dashed border-stone-300 hover:border-stone-500 cursor-pointer ${subordinate ? "text-stone-600" : "text-stone-900"} ${strong ? "font-semibold" : "font-medium"}`}>
                {label}
              </span>
            </InfoButton>
            {caption ? <p className={`mt-0.5 text-xs ${subordinate ? "text-stone-400" : "text-stone-500"}`}>{caption}</p> : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {detail ? (
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${subordinate ? "bg-white text-stone-400" : "bg-stone-100 text-stone-500"}`}>
              {detail}
            </span>
          ) : null}
          <p className={`text-sm ${subordinate ? "text-stone-700" : "text-stone-900"} ${strong ? "font-bold" : "font-semibold"}`}>{value}</p>
        </div>
      </div>
      {percent != null ? (
        <div className={`mt-2 h-1.5 overflow-hidden rounded-full ${subordinate ? "bg-stone-200/70" : "bg-stone-100"}`}>
          <div
            className={`h-full rounded-full transition-all duration-350 ${progressStyle || (subordinate ? "bg-stone-400" : "bg-emerald-500")}`}
            style={{ width: `${Math.min(Math.max(percent, 0), 100)}%` }}
          />
        </div>
      ) : null}
    </div>
  );
}

function StatusBadge({ status }: { status: Entry["parse_status"] }) {
  const styles =
    status === "parsed"
      ? "bg-emerald-50 text-emerald-700"
      : status === "failed"
        ? "bg-amber-100 text-amber-800"
        : "bg-stone-100 text-stone-700";

  const label = status === "parsed" ? "Parsed" : status === "failed" ? "Needs detail" : "Parsing";

  return <span className={`rounded-full px-2 py-1 text-[11px] font-medium ${styles}`}>{label}</span>;
}
