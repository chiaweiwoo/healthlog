"use client";

import { format } from "date-fns";
import {
  Dumbbell,
  BookOpen,
  ChevronDown,
  Droplets,
  Flame,
  NotebookPen,
  Pencil,
  RotateCcw,
  Trash2,
  Wheat,
  Wine,
  Activity,
} from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { toast } from "sonner";
import { DatePickerDialog } from "@/components/app/date-picker-dialog";
import { FullTextDialog } from "@/components/app/full-text-dialog";
import { InfoButton } from "@/components/app/info-button";
import { QuickNoteSheet } from "@/components/app/quick-note-sheet";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip } from "@/components/ui/tooltip";
import { atwaterFactors, getOutputBreakdown, thermicEffectRates } from "@/lib/calculations";
import {
  type EntryTableMetric,
  flattenEntriesForTable,
  formatEntryTableMetricValue,
  sumEntryTableMetric,
} from "@/lib/daily-entry-table";
import { deriveWaterTarget } from "@/lib/profile-memory";
import { cn } from "@/lib/utils";
import type { Profile } from "@/lib/schemas";

type Warning = { code: string; message: string; improveWith?: string };

type EntryItem = {
  kind: "food" | "water" | "exercise" | "note";
  label: string;
  occurredTime?: string | null;
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

type PendingConfirmation =
  | {
      action: "edit" | "delete";
      entryId: string;
      itemCount: number;
    }
  | null;

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

function getDeficitTextColor(summary: Summary) {
  if (!summary || summary.estimated_deficit === null) return "text-stone-900";
  return summary.estimated_deficit < 0 ? "text-amber-600" : "text-emerald-600";
}

function getPercent(value: number | null | undefined, total: number | null | undefined) {
  if (value == null || total == null || total <= 0) return null;
  return Math.round((value / total) * 100);
}

const entries2Metrics: Array<{ key: EntryTableMetric; label: string; totalLabel: string }> = [
  { key: "calories", label: "Calories", totalLabel: "Total Calories" },
  { key: "water", label: "Water", totalLabel: "Total Water" },
  { key: "protein", label: "Protein", totalLabel: "Total Protein" },
  { key: "fat", label: "Fat", totalLabel: "Total Fat" },
  { key: "carbs", label: "Carbs", totalLabel: "Total Carbs" },
  { key: "alcohol", label: "Alcohol", totalLabel: "Total Alcohol" },
  { key: "exercise", label: "Exercise", totalLabel: "Total Exercise" },
];

function FatMetricIcon({ size = 12 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 2C12 2 6 9 6 14.5C6 17.985 8.686 21 12 21C15.314 21 18 17.985 18 14.5C18 9 12 2 12 2Z" />
      <path d="M9 14C9.5 12.5 11 11 12.5 11" strokeWidth="1.5" />
    </svg>
  );
}

function Entries2MetricIcon({ metric, size = 13 }: { metric: EntryTableMetric; size?: number }) {
  if (metric === "calories") return <Flame size={size} />;
  if (metric === "water") return <Droplets size={size} />;
  if (metric === "protein") return <Dumbbell size={size} />;
  if (metric === "fat") return <FatMetricIcon size={size} />;
  if (metric === "carbs") return <Wheat size={size} />;
  if (metric === "alcohol") return <Wine size={size} />;
  return <Activity size={size} />;
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
  const [entries2Metric, setEntries2Metric] = useState<EntryTableMetric>("calories");
  const [recordDatesVersion, setRecordDatesVersion] = useState(0);
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingConfirmation>(null);
  const selectedDate = selectedDateOverride ?? browserToday;
  const isMountRef = useRef(true);
  const entriesSectionRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (isMountRef.current && selectedDate === initialDate && selectedDateOverride === null) {
      isMountRef.current = false;
      return;
    }
    isMountRef.current = false;
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
        body: JSON.stringify({ id, rawNote, clientToday: browserToday }),
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

  function beginEditEntry(entry: Entry) {
    setEditingId(entry.id);
    setEditNote(entry.raw_note);
    requestAnimationFrame(() => {
      entriesSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function requestEditEntry(entry: Entry) {
    if (entry.parsed_items.length > 1) {
      setPendingConfirmation({
        action: "edit",
        entryId: entry.id,
        itemCount: entry.parsed_items.length,
      });
      return;
    }
    beginEditEntry(entry);
  }

  function requestDeleteEntry(id: string, itemCount = 1) {
    setPendingConfirmation({
      action: "delete",
      entryId: id,
      itemCount,
    });
  }

  function handleConfirmationOpenChange(open: boolean) {
    if (!open) {
      setPendingConfirmation(null);
    }
  }

  function handleConfirmAction() {
    if (!pendingConfirmation) return;
    if (pendingConfirmation.action === "edit") {
      const entry = entries.find((candidate) => candidate.id === pendingConfirmation.entryId);
      setPendingConfirmation(null);
      if (entry) {
        beginEditEntry(entry);
      }
      return;
    }
    const entryId = pendingConfirmation.entryId;
    setPendingConfirmation(null);
    startTransition(() => removeEntry(entryId));
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

  const targetWaterMl = deriveWaterTarget(profile).value ?? 2500;

  const currentWaterMl = summary?.water_ml ?? 0;
  const pct = targetWaterMl > 0 ? Math.round((currentWaterMl / targetWaterMl) * 100) : 0;
  const hydrationStatus = pct >= 90 ? "optimal" : pct >= 50 ? "moderate" : "low";

  const hydrationIconColor =
    hydrationStatus === "optimal"
      ? "text-emerald-500"
      : hydrationStatus === "moderate"
        ? "text-sky-500"
        : "text-rose-500";

  const energyStatus = summary && summary.estimated_deficit !== null
    ? (summary.estimated_deficit < 0 ? "surplus" : "deficit")
    : "empty";

  const energyIconColor =
    energyStatus === "deficit"
      ? "text-emerald-500"
      : energyStatus === "surplus"
        ? "text-amber-500 animate-pulse"
        : "text-stone-400";
  const entries2Rows = flattenEntriesForTable(entries as never);
  const selectedEntries2Metric = entries2Metrics.find((metric) => metric.key === entries2Metric) ?? entries2Metrics[0];
  const entries2Unit = entries2Rows[0]?.measurements[entries2Metric].unit ?? (entries2Metric === "water" ? "ml" : entries2Metric === "exercise" || entries2Metric === "calories" ? "kcal" : "g");
  const entries2Total = sumEntryTableMetric(entries2Rows, entries2Metric);
  const editingEntry = entries.find((entry) => entry.id === editingId) ?? null;
  const unstructuredEntries = entries.filter((entry) => entry.parse_status !== "parsed" || entry.parsed_items.length === 0);

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
        <section className="rounded-xl border border-stone-200 bg-stone-50/60 p-5 shadow-sm transition-all duration-300">
          <SectionHeader
            icon={<Flame size={18} className={energyIconColor} />}
            iconBg="bg-orange-50/60"
            caption="DAILY ENERGY BALANCE"
            title="Energy Balance"
            action={
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
            }
          />
          {/* Prominent metric */}
          <p className={`mt-3 text-xl font-bold tracking-tight ${getDeficitTextColor(summary)}`}>
            {getDeficitDisplayTitle(summary)}
          </p>

          {/* In / Quota row + expand toggle inline */}
          <div className="mt-4 flex items-end gap-4 border-t border-stone-200/40 pt-4">
            <div className="flex flex-1 gap-4">
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
            <button
              type="button"
              aria-label={caloriesDetailOpen ? "Hide breakdown" : "Show breakdown"}
              onClick={() => setCaloriesDetailOpen((v) => !v)}
              className="mb-0.5 flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-full text-stone-400 transition hover:bg-stone-100/60 hover:text-stone-600"
            >
              <ChevronDown
                size={14}
                className={`transition-transform duration-200 ${caloriesDetailOpen ? "rotate-180" : ""}`}
              />
            </button>
          </div>

          {/* Intake vs quota bar */}
          {summary?.tdee != null && summary.tdee > 0 && (
            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-stone-200/50">
              <div
                className={`h-full rounded-full transition-all duration-500 ease-out ${energyStatus === "surplus" ? "bg-amber-400" : "bg-emerald-500"}`}
                style={{ width: `${Math.min(Math.round((summary.calories / summary.tdee) * 100), 100)}%` }}
              />
            </div>
          )}

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
                    caption={summary?.breakdown.meta?.caloriesIncomplete ? "Incomplete — more entries may change this" : undefined}
                  />
                  <MetricRow
                    label="Protein"
                    value={`${summary?.protein_g ?? 0} g`}
                    info="Protein contributes 4 kcal per gram and also drives a higher thermic effect."
                    detail={`${intakeBreakdown.proteinCalories} kcal`}
                    percent={getPercent(intakeBreakdown.proteinCalories, intakeBreakdown.totalCalories)}
                    progressStyle="bg-amber-400"
                    subordinate
                  />
                  <MetricRow
                    label="Fat"
                    value={`${summary?.fat_g ?? 0} g`}
                    info="Fat contributes 9 kcal per gram and a smaller thermic effect."
                    detail={`${intakeBreakdown.fatCalories} kcal`}
                    percent={getPercent(intakeBreakdown.fatCalories, intakeBreakdown.totalCalories)}
                    progressStyle="bg-amber-400"
                    subordinate
                  />
                  <MetricRow
                    label="Carbs"
                    value={`${summary?.carbs_g ?? 0} g`}
                    info="Carbohydrates contribute 4 kcal per gram."
                    detail={`${intakeBreakdown.carbsCalories} kcal`}
                    percent={getPercent(intakeBreakdown.carbsCalories, intakeBreakdown.totalCalories)}
                    progressStyle="bg-amber-400"
                    subordinate
                  />
                  <MetricRow
                    label="Alcohol"
                    value={`${summary?.alcohol_g ?? 0} g`}
                    info="Alcohol contributes 7 kcal per gram when present."
                    detail={`${intakeBreakdown.alcoholCalories} kcal`}
                    percent={getPercent(intakeBreakdown.alcoholCalories, intakeBreakdown.totalCalories)}
                    progressStyle="bg-amber-400"
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
                    progressStyle="bg-indigo-400"
                    subordinate
                  />
                  <MetricRow
                    label="NEAT"
                    value={output.baselineActivityCalories != null ? `${output.baselineActivityCalories} kcal` : "Profile needed"}
                    info="Non-Exercise Activity Thermogenesis is estimated from your baseline lifestyle and excludes runs, gym, deliberate step sessions, and other explicitly logged exercise."
                    percent={getPercent(output.baselineActivityCalories, output.totalTdee)}
                    progressStyle="bg-indigo-400"
                    subordinate
                  />
                  <MetricRow
                    label="TEF"
                    value={`${output.tefCalories} kcal`}
                    info="Thermic Effect of Food is estimated dynamically from today's protein, carbs, fat, and alcohol intake."
                    percent={getPercent(output.tefCalories, output.totalTdee)}
                    progressStyle="bg-indigo-400"
                    subordinate
                  />
                  <MetricRow
                    label="EAT"
                    value={`${summary?.exercise_calories ?? 0} kcal`}
                    info="Exercise Activity Thermogenesis comes from your explicitly logged exercise entries."
                    percent={getPercent(summary?.exercise_calories ?? 0, output.totalTdee)}
                    progressStyle="bg-indigo-400"
                    subordinate
                  />
                </div>
              </section>
            </div>
          )}
        </section>

        {/* 2. WATER */}
        <section className="rounded-xl border border-stone-200 bg-stone-50/60 p-4 shadow-sm space-y-3 transition-all duration-300">
          <SectionHeader
            icon={<Droplets size={18} className={hydrationIconColor} />}
            iconBg="bg-sky-50/60"
            caption="DAILY HYDRATION"
            title="Water Intake"
            action={
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
                        <li>Set up your profile details (weight, sex) in the <strong>Profile</strong> tab to get a personalized recommendation scaled at 35 ml/kg of body weight.</li>
                      )}
                      <li>Standard fallback targets: 3,000 ml for men, 2,200 ml for women, and 2,500 ml general baseline.</li>
                    </ul>
                    <p className="text-xs text-stone-500 mt-1">Note: Water contribution is counted from pure water entries as well as the liquid volume of calorie-bearing drinks (e.g. teas, juice, milk).</p>
                  </div>
                }
              />
            }
          />

          <div className="space-y-2 pt-1">
            <div className="flex justify-between items-baseline">
              <p className="text-sm font-semibold text-stone-800">
                {currentWaterMl.toLocaleString()} <span className="text-xs font-normal text-stone-500">ml</span>
              </p>
              <p className="text-xs font-medium text-stone-400">
                {pct}% of {targetWaterMl.toLocaleString()} ml
              </p>
            </div>
            <div className="h-3 w-full rounded-full bg-white/60 overflow-hidden shadow-inner border border-stone-200/20">
              <div
                className="h-full rounded-full transition-all duration-500 ease-out bg-sky-500"
                style={{ width: `${Math.min(pct, 100)}%` }}
              />
            </div>
          </div>
        </section>

        {/* 3. ENTRIES */}
        <section ref={entriesSectionRef} className="rounded-xl border border-stone-200 bg-stone-50/60 shadow-sm">
          <div className="p-4 pb-3">
            <SectionHeader
              icon={<BookOpen size={18} className="text-stone-400" />}
              caption="TODAY'S LOG"
              title="Entries"
              action={
                entries.length > 0 ? (
                  <span className="inline-flex h-5 items-center justify-center rounded-full bg-stone-100 px-2.5 text-[10px] font-bold text-stone-500 border border-stone-200/50">
                    {entries.length}
                  </span>
                ) : null
              }
            />
          </div>

          <div className="px-3 pb-3">
            {editingEntry ? (
              <div className="mb-3 rounded-lg border border-stone-200 bg-white/90 p-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400">Original note</p>
                <Textarea
                  value={editNote}
                  onChange={(event) => setEditNote(event.target.value)}
                  disabled={isPending}
                  className="mt-2 h-20 resize-none rounded-lg border-stone-200 bg-white text-sm"
                />
                <div className="mt-2 flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => startTransition(() => saveEdit(editingEntry.id))}
                    disabled={isPending || !editNote.trim()}
                    className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    Save
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setEditingId(null);
                      setEditNote("");
                    }}
                    disabled={isPending}
                    className="rounded-lg border-stone-200 px-3 py-1.5 text-xs font-semibold text-stone-700 hover:bg-stone-50"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : null}

            <div className="rounded-lg border border-stone-200 bg-white/90 p-3 pb-20">
              <fieldset>
                <legend className="sr-only">Entries measurement selector</legend>
                <div className="grid grid-cols-7 gap-1.5" role="radiogroup" aria-label="Entries measurement selector">
                  {entries2Metrics.map((metric) => (
                    <button
                      key={metric.key}
                      type="button"
                      role="radio"
                      aria-checked={entries2Metric === metric.key}
                      aria-label={metric.label}
                      className={cn(
                        "inline-flex h-8 w-full items-center justify-center rounded-md border px-1.5 transition cursor-pointer",
                        entries2Metric === metric.key
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                          : "border-stone-200 bg-white text-stone-500 hover:bg-stone-50 hover:text-stone-800",
                      )}
                      title={metric.label}
                      onClick={() => setEntries2Metric(metric.key)}
                    >
                      <Entries2MetricIcon metric={metric.key} size={14} />
                    </button>
                  ))}
                </div>
              </fieldset>

              <div className="mt-3 flex items-baseline justify-between gap-3 border-t border-stone-200 pt-3">
                <p className="text-xs font-medium text-stone-500">{selectedEntries2Metric.totalLabel}</p>
                <p className="text-sm font-bold tabular-nums text-stone-900">
                  {formatEntryTableMetricValue(entries2Total, entries2Unit)}
                </p>
              </div>

              {entries2Rows.length ? (
                <div className="mt-3 overflow-hidden rounded-lg border border-stone-200 bg-white text-sm">
                  <div
                    className="grid items-center gap-x-2 bg-stone-50/80 px-2 py-2 text-[11px] uppercase tracking-wide text-stone-500"
                    style={{ gridTemplateColumns: "3rem minmax(0,1fr) 4.5rem" }}
                  >
                    <div className="font-semibold">Time</div>
                    <div className="font-semibold">Item</div>
                    <div className="flex justify-end">
                      <span className="inline-flex text-stone-500">
                        <Entries2MetricIcon metric={entries2Metric} size={13} />
                      </span>
                    </div>
                  </div>
                  {entries2Rows.map((row) => {
                    const measurement = row.measurements[entries2Metric];
                    const sourceEntry = entries.find((entry) => entry.id === row.entryId);
                    return (
                      <div
                        key={row.id}
                        className="grid items-start gap-x-2 border-t border-stone-200 px-2 py-2 first:border-t-0"
                        style={{ gridTemplateColumns: "3rem minmax(0,1fr) 4.5rem" }}
                      >
                        <div className="pt-0.5 text-xs font-semibold tabular-nums text-stone-500">
                          {row.time}
                        </div>
                        <div className="min-w-0 overflow-hidden">
                          <FullTextDialog
                            title="Item"
                            text={row.label}
                            className="block min-w-0 max-w-full"
                            previewClassName="block overflow-hidden text-ellipsis whitespace-nowrap text-sm font-medium text-stone-900"
                          >
                            <div className="space-y-3">
                              {row.warnings.length ? (
                                <div className="space-y-2">
                                  {row.warnings.map((warning, index) => (
                                    <div key={`${warning.code}-${index}`} className="rounded-md border border-amber-200 bg-amber-50 p-2.5">
                                      <p className="text-sm font-medium text-amber-950">{warning.message}</p>
                                      {warning.improveWith ? <p className="mt-1 text-xs text-amber-800">{warning.improveWith}</p> : null}
                                    </div>
                                  ))}
                                </div>
                              ) : null}
                              {sourceEntry ? (
                                <div className="flex justify-end gap-2 border-t border-stone-200 pt-3">
                                  <DialogClose asChild>
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="icon"
                                      disabled={isPending}
                                      aria-label="Edit original note"
                                      title="Edit original note"
                                      onClick={() => requestEditEntry(sourceEntry)}
                                      className="h-8 w-8 rounded-lg border-stone-200 text-stone-700 hover:bg-stone-50"
                                    >
                                      <Pencil size={13} />
                                    </Button>
                                  </DialogClose>
                                  <DialogClose asChild>
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="icon"
                                      disabled={isPending}
                                      aria-label="Delete original note"
                                      title="Delete original note"
                                      onClick={() => requestDeleteEntry(sourceEntry.id, sourceEntry.parsed_items.length)}
                                      className="h-8 w-8 rounded-lg border-rose-100 text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                                    >
                                      <Trash2 size={13} />
                                    </Button>
                                  </DialogClose>
                                </div>
                              ) : null}
                            </div>
                          </FullTextDialog>
                        </div>
                        <div className="pt-0.5 text-right text-sm font-semibold tabular-nums text-stone-700 whitespace-nowrap">
                          {formatEntryTableMetricValue(measurement.value, measurement.unit)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="mt-3 rounded-lg border border-dashed border-stone-200 bg-stone-50/40 px-3 py-4 text-sm text-stone-500">
                  {entries.length ? "No item rows to show yet." : "No records yet today."}
                </div>
              )}

              {unstructuredEntries.length ? (
                <div className="mt-3 space-y-2 border-t border-stone-200 pt-3">
                  {unstructuredEntries.map((entry) => (
                    <div key={entry.id} className="rounded-lg border border-amber-200 bg-amber-50/50 p-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-amber-700">
                            {entry.parse_status === "pending" ? "Processing" : "Needs detail"}
                          </p>
                          <FullTextDialog
                            title="Entry"
                            text={entry.raw_note}
                            className="mt-1 block min-w-0"
                            previewClassName="block overflow-hidden text-ellipsis whitespace-nowrap text-sm font-medium text-stone-900"
                          />
                        </div>
                        <div className="flex shrink-0 gap-1">
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            disabled={isPending}
                            aria-label="Edit original note"
                            title="Edit original note"
                            onClick={() => requestEditEntry(entry)}
                            className="h-8 w-8 rounded-lg border-stone-200 bg-white text-stone-700 hover:bg-stone-50"
                          >
                            <Pencil size={13} />
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            disabled={isPending}
                            aria-label="Delete original note"
                            title="Delete original note"
                            onClick={() => requestDeleteEntry(entry.id, entry.parsed_items.length)}
                            className="h-8 w-8 rounded-lg border-rose-100 bg-white text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                          >
                            <Trash2 size={13} />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
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

      <Dialog open={Boolean(pendingConfirmation)} onOpenChange={handleConfirmationOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {pendingConfirmation?.action === "edit" ? "Edit entry?" : "Delete entry?"}
            </DialogTitle>
            <DialogDescription>
              {pendingConfirmation?.action === "edit"
                ? `This original note contains ${pendingConfirmation.itemCount} items. Editing it will reparse the whole note and may change all linked items.`
                : pendingConfirmation?.itemCount && pendingConfirmation.itemCount > 1
                  ? `This original note contains ${pendingConfirmation.itemCount} items. Deleting this removes the whole entry.`
                  : "Are you sure you want to delete this entry?"}
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 flex justify-end gap-2">
            <DialogClose asChild>
              <Button type="button" variant="outline" className="border-stone-200 text-stone-700 hover:bg-stone-50">
                Cancel
              </Button>
            </DialogClose>
            <Button
              type="button"
              disabled={isPending}
              onClick={handleConfirmAction}
              className={
                pendingConfirmation?.action === "delete"
                  ? "bg-rose-600 text-white hover:bg-rose-700"
                  : "bg-emerald-600 text-white hover:bg-emerald-700"
              }
            >
              {pendingConfirmation?.action === "edit" ? "Continue" : "Delete"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
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
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

