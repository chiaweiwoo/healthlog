"use client";

import { format } from "date-fns";
import {
  BookOpen,
  ChartColumnIncreasing,
  Droplets,
  Flame,
  NotebookPen,
  Pencil,
  Trash2,
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
import { atwaterFactors, getOutputBreakdown, thermicEffectRates } from "@/lib/calculations";
import {
  flattenEntriesForTable,
  formatEntryTableMetricValue,
} from "@/lib/daily-entry-table";
import { deriveWaterTarget } from "@/lib/profile-memory";
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

function getVisibleMeasurements(
  measurements: {
    calories: { value: number | null; unit: string };
    water: { value: number | null; unit: string };
    protein: { value: number | null; unit: string };
    fat: { value: number | null; unit: string };
    carbs: { value: number | null; unit: string };
    alcohol: { value: number | null; unit: string };
    exercise: { value: number | null; unit: string };
  },
) {
  return (Object.entries(MEASUREMENT_LABELS) as Array<[keyof typeof MEASUREMENT_LABELS, string]>)
    .map(([key, label]) => ({
      key,
      label,
      value: measurements[key].value,
      unit: measurements[key].unit,
    }))
    .filter((measurement) => measurement.value !== null && measurement.value !== 0);
}

function formatCompactTableValue(value: number | null) {
  if (value === null || value === 0) return "";
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 10) / 10);
}

const ENERGY_TAB_COPY = {
  intake: {
    title: "Calories Intake",
    body: "Uses Atwater factors from known macros. Water still counts from pure water entries and calorie-bearing drinks that include liquid volume.",
  },
  quota: {
    title: "Calories Quota",
    body: "TDEE combines BMR, baseline daily movement, thermic effect of food, and explicitly logged exercise.",
  },
} as const;

type EnergyDetailsTab = "intake" | "quota";

const MEASUREMENT_LABELS = {
  calories: "Calories",
  water: "Water",
  protein: "Protein",
  fat: "Fat",
  carbs: "Carbs",
  alcohol: "Alcohol",
  exercise: "Exercise",
} as const;

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
  const [energyDetailsOpen, setEnergyDetailsOpen] = useState(false);
  const [energyDetailsTab, setEnergyDetailsTab] = useState<EnergyDetailsTab>("intake");
  const [quickNoteOpen, setQuickNoteOpen] = useState(false);
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
  const editingEntry = entries.find((entry) => entry.id === editingId) ?? null;
  const unstructuredEntries = entries.filter((entry) => entry.parse_status !== "parsed" || entry.parsed_items.length === 0);

  return (
    <main className="mx-auto max-w-2xl px-3 py-4 pb-28 sm:px-4 sm:py-6">
      <div className="space-y-4">

        {/* Header: date + date picker */}
        <div className="flex items-center justify-between gap-3 py-1.5 md:py-2">
          <h2 className="text-xl font-bold tracking-tight text-stone-900 font-sans">
            {format(parseDateOnly(selectedDate), "EEEE, d MMM yyyy")}
          </h2>
          <div className="flex items-center gap-2">
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
              <button
                type="button"
                aria-label="Show energy details"
                title="Show energy details"
                onClick={() => {
                  setEnergyDetailsTab("intake");
                  setEnergyDetailsOpen(true);
                }}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-stone-200 bg-white text-stone-500 shadow-sm transition hover:bg-stone-50 hover:text-stone-800"
              >
                <ChartColumnIncreasing size={15} />
              </button>
            }
          />
          <div className="space-y-2 pt-4">
            <div className="flex justify-between items-baseline gap-3 border-t border-stone-200/40 pt-4">
              <p className="text-sm font-semibold text-stone-800">
                {summary ? `${summary.calories.toLocaleString()}` : "0"}{" "}
                <span className="text-xs font-normal text-stone-500">kcal</span>
              </p>
              <p className="text-xs font-medium text-stone-400">
                {summary?.tdee != null
                  ? `${Math.min(Math.round((summary.calories / summary.tdee) * 100), 100)}% of ${summary.tdee.toLocaleString()} kcal`
                  : "Quota unavailable"}
              </p>
            </div>
            <p className={`text-sm font-bold ${getDeficitTextColor(summary)}`}>
              {getDeficitDisplayTitle(summary)}
            </p>
          </div>

          {summary !== null && false ? (
          <div className="mt-4 flex items-end gap-4 border-t border-stone-200/40 pt-4">
            <div className="flex flex-1 gap-4">
              <div className="text-left">
                <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400">In (Intake)</span>
                <p className="mt-0.5 text-lg font-bold text-stone-800">
                  {summary?.calories ?? 0}{" "}
                  <span className="text-xs font-normal text-stone-500 font-sans">kcal</span>
                </p>
              </div>
              <div className="border-l border-stone-200/40 pl-4 text-left">
                <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400">Quota (TDEE)</span>
                <p className="mt-0.5 text-lg font-bold text-stone-800">
                  {summary?.tdee != null ? `${summary?.tdee}` : "â€”"}{" "}
                  <span className="text-xs font-normal text-stone-500 font-sans">kcal</span>
                </p>
              </div>
            </div>
          </div>
          ) : null}

          {/* Intake vs quota bar */}
          {summary?.tdee != null && summary.tdee > 0 && (
            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-stone-200/50">
              <div
                className={`h-full rounded-full transition-all duration-500 ease-out ${energyStatus === "surplus" ? "bg-amber-400" : "bg-emerald-500"}`}
                style={{ width: `${Math.min(Math.round((summary.calories / summary.tdee) * 100), 100)}%` }}
              />
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

            <div className="rounded-lg border border-stone-200 bg-white/90 p-3">
              {entries2Rows.length ? (
                <div className="overflow-hidden rounded-lg border border-stone-200 bg-white text-sm">
                  <div
                    className="grid items-center gap-x-2 bg-stone-50/80 px-2 py-2 text-[11px] uppercase tracking-wide text-stone-500"
                    style={{ gridTemplateColumns: "2.8rem minmax(0,1fr) minmax(0,3.35rem) minmax(0,3.35rem)" }}
                  >
                    <div className="font-semibold">Time</div>
                    <div className="font-semibold">Item</div>
                    <div className="flex items-center justify-end gap-1 text-stone-500">
                      <Flame size={12} />
                      <span className="text-[10px] font-semibold normal-case tracking-normal">kcal</span>
                    </div>
                    <div className="flex items-center justify-end gap-1 text-stone-500">
                      <Droplets size={12} />
                      <span className="text-[10px] font-semibold normal-case tracking-normal">ml</span>
                    </div>
                  </div>
                  {entries2Rows.map((row) => {
                    const sourceEntry = entries.find((entry) => entry.id === row.entryId);
                    const visibleMeasurements = getVisibleMeasurements(row.measurements);
                    return (
                      <div
                        key={row.id}
                        className="grid items-start gap-x-2 border-t border-stone-200 px-2 py-2 first:border-t-0"
                        style={{ gridTemplateColumns: "2.8rem minmax(0,1fr) minmax(0,3.35rem) minmax(0,3.35rem)" }}
                      >
                        <div className="pt-0.5 text-[12px] font-medium tabular-nums text-stone-500">
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
                              {visibleMeasurements.length ? (
                                <div className="space-y-1.5">
                                  <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400">Details</p>
                                  <div className="space-y-1.5 rounded-md border border-stone-200 bg-stone-50/70 p-2.5">
                                    {visibleMeasurements.map((measurement) => (
                                      <div key={measurement.key} className="flex items-baseline justify-between gap-3 text-sm">
                                        <p className="text-stone-600">{measurement.label}</p>
                                        <p className="font-semibold tabular-nums text-stone-900">
                                          {formatEntryTableMetricValue(measurement.value, measurement.unit)}
                                        </p>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ) : null}
                              {row.warnings.length ? (
                                <div className="space-y-2">
                                  {row.warnings.map((warning, index) => (
                                    <div key={warning.code + '-' + index} className="rounded-md border border-amber-200 bg-amber-50 p-2.5">
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
                        <div className="pt-0.5 text-right text-[13px] font-medium tabular-nums text-stone-600 whitespace-nowrap">
                          {formatCompactTableValue(row.caloriesDisplayValue.value)}
                        </div>
                        <div className="pt-0.5 text-right text-[13px] font-medium tabular-nums text-stone-600 whitespace-nowrap">
                          {formatCompactTableValue(row.waterDisplayValue.value)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-stone-200 bg-stone-50/40 px-3 py-4 text-sm text-stone-500">
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

      <Dialog open={energyDetailsOpen} onOpenChange={setEnergyDetailsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Energy details</DialogTitle>
          </DialogHeader>
          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-2 gap-2 rounded-lg border border-stone-200 bg-stone-50/80 p-1">
              <button
                type="button"
                onClick={() => setEnergyDetailsTab("intake")}
                className={`rounded-md px-3 py-2 text-sm font-medium transition ${
                  energyDetailsTab === "intake"
                    ? "bg-white text-stone-900 shadow-sm"
                    : "text-stone-500 hover:text-stone-800"
                }`}
              >
                Intake
              </button>
              <button
                type="button"
                onClick={() => setEnergyDetailsTab("quota")}
                className={`rounded-md px-3 py-2 text-sm font-medium transition ${
                  energyDetailsTab === "quota"
                    ? "bg-white text-stone-900 shadow-sm"
                    : "text-stone-500 hover:text-stone-800"
                }`}
              >
                Quota
              </button>
            </div>

            {energyDetailsTab === "intake" ? (
              <section className="space-y-3">
                <div className="rounded-lg border border-stone-200 bg-stone-50/70 px-3 py-2.5">
                  <p className="text-sm font-semibold text-stone-900">{ENERGY_TAB_COPY.intake.title}</p>
                  <p className="mt-1 text-xs leading-relaxed text-stone-600">{ENERGY_TAB_COPY.intake.body}</p>
                  <p className="mt-2 text-xs text-stone-500">
                    Protein {atwaterFactors.protein} kcal/g, fat {atwaterFactors.fat} kcal/g, carbs {atwaterFactors.carbs} kcal/g, alcohol {atwaterFactors.alcohol} kcal/g.
                  </p>
                </div>
                <div className="overflow-hidden rounded-lg border border-stone-200 bg-white/90">
                  <MetricRow
                    label="Calories"
                    value={`${summary?.calories ?? 0} kcal`}
                    info="Intake calories are the known total from food and drinks."
                    caption={summary?.breakdown.meta?.caloriesIncomplete ? "Incomplete data - more entries may change this" : undefined}
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
            ) : (
              <section className="space-y-3">
                <div className="rounded-lg border border-stone-200 bg-stone-50/70 px-3 py-2.5">
                  <p className="text-sm font-semibold text-stone-900">{ENERGY_TAB_COPY.quota.title}</p>
                  <p className="mt-1 text-xs leading-relaxed text-stone-600">{ENERGY_TAB_COPY.quota.body}</p>
                  <p className="mt-2 text-xs text-stone-500">
                    TEF rates: protein {Math.round(thermicEffectRates.protein * 100)}%, carbs {Math.round(thermicEffectRates.carbs * 100)}%, fat {Math.round(thermicEffectRates.fat * 100)}%, alcohol {Math.round(thermicEffectRates.alcohol * 100)}%.
                  </p>
                </div>
                <div className="overflow-hidden rounded-lg border border-stone-200 bg-white/90">
                  <MetricRow
                    label="TDEE"
                    value={summary?.tdee != null ? `${summary?.tdee} kcal` : "Profile needed"}
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
            )}
          </div>
        </DialogContent>
      </Dialog>

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

