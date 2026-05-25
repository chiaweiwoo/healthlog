"use client";

import { format } from "date-fns";
import {
  ChevronDown,
  Drumstick,
  Droplet,
  Droplets,
  Flame,
  Martini,
  NotebookPen,
  Pencil,
  Sparkles,
  Timer,
  Trash2,
  UtensilsCrossed,
  Wheat,
} from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useState, useSyncExternalStore, useTransition } from "react";
import { toast } from "sonner";
import { DatePickerDialog } from "@/components/app/date-picker-dialog";
import { FullTextDialog } from "@/components/app/full-text-dialog";
import { InfoButton } from "@/components/app/info-button";
import { WarningDot } from "@/components/app/warning-dot";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { atwaterFactors, getDisplayNutrition, getOutputBreakdown, thermicEffectRates } from "@/lib/calculations";

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

function formatFoodNutrition(item: EntryItem) {
  const derived = getDisplayNutrition(item);
  const parts: string[] = [];
  if (derived.calories != null) parts.push(`${derived.calories} kcal`);
  if (derived.proteinG != null) parts.push(`P ${derived.proteinG}g`);
  if (derived.fatG != null) parts.push(`F ${derived.fatG}g`);
  if (derived.carbsG != null) parts.push(`C ${derived.carbsG}g`);
  if (derived.alcoholG != null) parts.push(`A ${derived.alcoholG}g`);
  if (item.waterMl != null) parts.push(`Water ${item.waterMl} ml`);
  if (parts.length) return parts.join(" | ");
  return "Estimate unavailable";
}

function formatBreakdownDetail(item: EntryItem, section: "food" | "exercise") {
  if (section === "exercise") return item.exerciseCalories != null ? `${item.exerciseCalories} kcal burn` : "Exercise recorded";
  return formatFoodNutrition(item);
}

function formatBreakdownTime(item: EntryItem) {
  const parts: string[] = [];
  if (item.sourceOccurredTime) parts.push(`Occurred ${item.sourceOccurredTime}`);
  if (item.sourceCreatedAt) parts.push(`Logged ${format(new Date(item.sourceCreatedAt), "p")}`);
  return parts.join(" / ");
}

function getDeficitLabel(summary: Summary) {
  if (!summary) return "No data yet";
  if (hasWarningCode(summary.warnings, "profile_incomplete") || hasWarningCode(summary.warnings, "activity_missing")) {
    return "Profile needed";
  }
  if (summary.breakdown.meta?.caloriesIncomplete || (summary.breakdown.meta?.unparsedEntryCount ?? 0) > 0) {
    return "Estimate incomplete";
  }
  if (summary.estimated_deficit == null) {
    return "Estimate incomplete";
  }
  if (summary.estimated_deficit < 0) {
    return `Surplus ${Math.abs(summary.estimated_deficit)} kcal`;
  }
  return `${summary.estimated_deficit} kcal`;
}

function getDeficitTone(summary: Summary) {
  if (!summary || summary.estimated_deficit === null) return "border-stone-200 bg-stone-50";
  return summary.estimated_deficit < 0 ? "border-amber-200 bg-amber-50" : "border-emerald-200 bg-emerald-50";
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
  if (!entry.is_active) return "border-stone-100 bg-stone-50 opacity-70";
  if (entry.parse_status === "failed") return "border-amber-200 bg-amber-50/50";
  if (entry.parse_status === "pending") return "border-stone-200 bg-stone-50";
  return "border-stone-200 bg-white";
}

function getFoodAndDrinkItems(summary: Summary) {
  if (!summary) return [];
  const food = summary.breakdown.food ?? [];
  const extraWater = (summary.breakdown.water ?? []).filter((item) => item.kind === "water");
  return [...food, ...extraWater];
}

function getPercent(value: number | null | undefined, total: number | null | undefined) {
  if (value == null || total == null || total <= 0) return null;
  return Math.round((value / total) * 100);
}

export function DailyDashboard({
  initialDate,
  initialEntries,
  initialSummary,
}: {
  initialDate: string;
  initialEntries: Entry[];
  initialSummary: Summary;
}) {
  const browserToday = useSyncExternalStore(
    () => () => {},
    getLocalDateString,
    () => initialDate,
  );
  const [selectedDateOverride, setSelectedDateOverride] = useState<string | null>(null);
  const [entries, setEntries] = useState(initialEntries);
  const [summary, setSummary] = useState<Summary>(initialSummary);
  const [note, setNote] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editNote, setEditNote] = useState("");
  const [isPending, startTransition] = useTransition();
  const [expanded, setExpanded] = useState<string | null>("food");
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

  async function submitNote() {
    const rawNote = note.trim();
    if (!rawNote) return;
    const toastId = toast.loading("Saving note...");
    try {
      const response = await fetch("/api/daily-entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: selectedDate, rawNote }),
      });
      const body = (await response.json().catch(() => null)) as
        | { entry?: Entry; summary?: Summary; error?: string; requestId?: string }
        | null;
      if (!response.ok) {
        const errorMsg = body?.requestId ? `${body.error ?? "Could not save note."} (${body.requestId})` : (body?.error ?? "Could not save note.");
        toast.error(errorMsg, { id: toastId });
        return;
      }
      const newEntry = body?.entry;
      if (newEntry) {
        setEntries((current) => [newEntry, ...current.filter((entry) => entry.id !== newEntry.id)]);
        if (newEntry.parse_status === "failed") {
          toast.warning("Saved, but parsing failed. Check warnings.", { id: toastId });
        } else {
          toast.success("Entry added.", { id: toastId });
        }
      } else {
        toast.success("Entry added.", { id: toastId });
      }
      setSummary(body?.summary ?? null);
      setNote("");
      setRecordDatesVersion((current) => current + 1);
    } catch {
      toast.error("Could not save note.", { id: toastId });
    }
  }

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

  const output = getOutputBreakdown({
    bmr: summary?.bmr ?? null,
    baseTdee: summary?.base_tdee ?? null,
    exerciseCalories: summary?.exercise_calories ?? 0,
    proteinG: summary?.protein_g ?? 0,
    fatG: summary?.fat_g ?? 0,
    carbsG: summary?.carbs_g ?? 0,
    alcoholG: summary?.alcohol_g ?? 0,
  });

  const breakdownSections = [
    { key: "food", label: "Food & drinks", items: getFoodAndDrinkItems(summary) },
    { key: "exercise", label: "Exercise", items: summary?.breakdown?.exercise ?? [] },
  ] as const;

  return (
    <main className="mx-auto max-w-6xl overflow-x-hidden px-3 py-4 sm:px-4 sm:py-6">
      <div className="grid min-w-0 gap-4 lg:grid-cols-[1.12fr_0.88fr]">
        <section className="min-w-0 space-y-4">
          <Card className="overflow-hidden">
            <CardHeader className="space-y-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-sm font-medium text-emerald-700">{format(parseDateOnly(selectedDate), "EEE, d MMM")}</p>
                  <CardTitle className="mt-1 text-xl">How today is going</CardTitle>
                </div>
                <DatePickerDialog
                  value={selectedDate}
                  onChange={(value) => setSelectedDateOverride(value)}
                  refreshKey={recordDatesVersion}
                />
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <section className="rounded-lg bg-stone-50 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-stone-900">Intake</p>
                    <p className="mt-1 text-xs text-stone-500">Food and drink totals for the day.</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <InfoButton
                      title="How intake is calculated"
                      description={
                        <>
                          <p>Intake calories come from the general Atwater system when macro grams are available.</p>
                          <ul className="list-disc space-y-1 pl-4">
                            <li>Protein: {atwaterFactors.protein} kcal per gram</li>
                            <li>Fat: {atwaterFactors.fat} kcal per gram</li>
                            <li>Carbs: {atwaterFactors.carbs} kcal per gram</li>
                            <li>Alcohol: {atwaterFactors.alcohol} kcal per gram</li>
                          </ul>
                          <p>Water is counted from drinks and water entries that include liquid volume.</p>
                        </>
                      }
                    />
                    <WarningDot warnings={summary?.warnings} label="Intake warnings" />
                  </div>
                </div>
                <div className="mt-3 overflow-hidden rounded-md border border-stone-200 bg-white">
                  <MetricRow
                    icon={<Flame size={16} />}
                    label="Calories"
                    value={`${summary?.calories ?? 0} kcal`}
                    info="Intake calories are the known total from food and drinks."
                    caption={summary?.breakdown.meta?.caloriesIncomplete ? "Known total so far" : "Known total"}
                  />
                  <MetricRow
                    icon={<Droplets size={16} />}
                    label="Water"
                    value={`${summary?.water_ml ?? 0} ml`}
                    info="Water includes drinks and water entries with liquid volume."
                  />
                  <MetricRow
                    icon={<Drumstick size={16} />}
                    label="Protein"
                    value={`${summary?.protein_g ?? 0} g`}
                    info="Protein contributes 4 kcal per gram and also drives a higher thermic effect."
                  />
                  <MetricRow
                    icon={<Droplet size={16} />}
                    label="Fat"
                    value={`${summary?.fat_g ?? 0} g`}
                    info="Fat contributes 9 kcal per gram and a smaller thermic effect."
                  />
                  <MetricRow
                    icon={<Wheat size={16} />}
                    label="Carbs"
                    value={`${summary?.carbs_g ?? 0} g`}
                    info="Carbohydrates contribute 4 kcal per gram."
                  />
                  <MetricRow
                    icon={<Martini size={16} />}
                    label="Alcohol"
                    value={`${summary?.alcohol_g ?? 0} g`}
                    info="Alcohol contributes 7 kcal per gram when present."
                  />
                </div>
              </section>

              <section className="rounded-lg bg-stone-50 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-stone-900">Output</p>
                    <p className="mt-1 text-xs text-stone-500">Estimated daily energy expenditure.</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <InfoButton
                      title="How output is calculated"
                      description={
                        <>
                          <p>BMR uses the Mifflin-St Jeor formula from your body profile.</p>
                          <p>Baseline activity comes from your chosen baseline lifestyle and represents conservative non-exercise movement only.</p>
                          <p>TEF uses a macro-based estimate:</p>
                          <ul className="list-disc space-y-1 pl-4">
                            <li>Protein: {Math.round(thermicEffectRates.protein * 100)}%</li>
                            <li>Carbs: {Math.round(thermicEffectRates.carbs * 100)}%</li>
                            <li>Fat: {Math.round(thermicEffectRates.fat * 100)}%</li>
                            <li>Alcohol: {Math.round(thermicEffectRates.alcohol * 100)}%</li>
                          </ul>
                          <p>Total TDEE is calculated as BMR + baseline activity + TEF + EAT.</p>
                        </>
                      }
                    />
                    <WarningDot warnings={summary?.warnings} label="Output warnings" />
                  </div>
                </div>
                <div className="mt-3 overflow-hidden rounded-md border border-stone-200 bg-white">
                  <MetricRow
                    icon={<Flame size={16} />}
                    label="BMR"
                    value={summary?.bmr != null ? `${summary.bmr} kcal` : "Profile needed"}
                    info="Basal Metabolic Rate is the calories your body uses at rest."
                    percent={getPercent(output.bmr, output.totalTdee)}
                  />
                  <MetricRow
                    icon={<Sparkles size={16} />}
                    label="Baseline activity"
                    value={output.baselineActivityCalories != null ? `${output.baselineActivityCalories} kcal` : "Profile needed"}
                    info="Baseline activity is estimated from your baseline lifestyle and excludes runs, gym, deliberate step sessions, and other explicitly logged exercise."
                    percent={getPercent(output.baselineActivityCalories, output.totalTdee)}
                  />
                  <MetricRow
                    icon={<UtensilsCrossed size={16} />}
                    label="TEF"
                    value={`${output.tefCalories} kcal`}
                    info="Thermic Effect of Food is estimated dynamically from today&apos;s protein, carbs, fat, and alcohol intake."
                    percent={getPercent(output.tefCalories, output.totalTdee)}
                  />
                  <MetricRow
                    icon={<Timer size={16} />}
                    label="EAT"
                    value={`${summary?.exercise_calories ?? 0} kcal`}
                    info="Exercise Activity Thermogenesis comes from your explicitly logged exercise entries."
                    percent={getPercent(summary?.exercise_calories ?? 0, output.totalTdee)}
                  />
                  <MetricRow
                    icon={<Flame size={16} />}
                    label="Total TDEE"
                    value={summary?.tdee != null ? `${summary.tdee} kcal` : "Profile needed"}
                    info="Total TDEE is the app&apos;s estimate of daily energy out."
                    percent={output.totalTdee != null ? 100 : null}
                    strong
                  />
                </div>
              </section>

              <section className={`rounded-lg border p-3 ${getDeficitTone(summary)}`}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-stone-900">Deficit</p>
                    <p className="mt-1 text-xs text-stone-500">Out - in</p>
                  </div>
                  <InfoButton
                    title="How deficit is calculated"
                    description={<p>Deficit is Total TDEE minus intake calories. If the result is negative, the day is in surplus instead.</p>}
                  />
                </div>
                <div className="mt-3 flex items-end justify-between gap-4">
                  <p className="text-2xl font-semibold text-stone-900">{getDeficitLabel(summary)}</p>
                  <p className="text-right text-sm text-stone-500">
                    {summary?.tdee != null ? `${summary.tdee} kcal` : "Profile needed"} - {summary ? `${summary.calories} kcal` : "0 kcal"}
                  </p>
                </div>
              </section>

              <div className="space-y-2">
                {breakdownSections.map((section) => (
                  <div key={section.key} className="rounded-md border border-stone-200">
                    <button
                      className="flex w-full items-center justify-between px-3 py-3 text-left text-sm font-medium text-stone-800 hover:bg-stone-100/60 rounded-md transition-colors duration-150"
                      onClick={() => setExpanded((current) => (current === section.key ? null : section.key))}
                      type="button"
                    >
                      <span>{section.label}</span>
                      <ChevronDown
                        size={16}
                        className={`transition-transform ${expanded === section.key ? "rotate-180" : ""}`}
                      />
                    </button>
                    {expanded === section.key ? (
                      <div className="border-t border-stone-200 px-3 py-2 text-sm text-stone-600">
                        {section.items.length ? (
                          <div className="space-y-2">
                            {section.items.map((item, index) => (
                              <div key={`${section.key}-${item.sourceEntryId ?? "summary"}-${index}`} className="rounded-md bg-stone-50 px-3 py-2">
                                <div className="flex items-start gap-2">
                                  <FullTextDialog
                                    title={section.label}
                                    text={item.label}
                                    className="min-w-0 flex-1"
                                    previewClassName="text-sm font-medium text-stone-900 break-words"
                                  />
                                  <WarningDot warnings={item.warnings} label={`${item.label} warnings`} className="-mt-1 shrink-0" />
                                </div>
                                <p className="mt-1 text-xs text-stone-500">{formatBreakdownDetail(item, section.key)}</p>
                                {formatBreakdownTime(item) ? <p className="mt-1 text-[11px] text-stone-400">{formatBreakdownTime(item)}</p> : null}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p>No {section.label.toLowerCase()} logged.</p>
                        )}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <CardTitle className="text-lg">Quick note</CardTitle>
                <InfoButton
                  title="Quick note tips"
                  description={
                    <>
                      <p>Use one messy note if that feels natural. HealthLog will keep the raw text and try to structure it for the day.</p>
                      <ul className="list-disc space-y-1 pl-4">
                        <li>Food and drink names can mix English and Chinese.</li>
                        <li>Time is optional, but useful when you know it.</li>
                        <li>You can include exercise, water, and short remarks in the same note.</li>
                      </ul>
                    </>
                  }
                />
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea value={note} onChange={(event) => setNote(event.target.value)} />
              <Button
                className="w-full sm:w-auto"
                disabled={isPending || !note.trim()}
                onClick={() => startTransition(submitNote)}
                type="button"
              >
                <NotebookPen size={16} />
                {isPending ? "Saving..." : "Add note"}
              </Button>
            </CardContent>
          </Card>
        </section>

        <Card className="min-w-0">
          <CardHeader>
            <CardTitle className="text-lg">Entries</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {entries.length ? (
              entries.map((entry) => {
                const isEditing = editingId === entry.id;
                return (
                  <article key={entry.id} className={`rounded-lg border p-3 ${getEntryStatusTone(entry)}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <FullTextDialog
                            title="Entry title"
                            text={getEntryHeadline(entry)}
                            className="min-w-0 flex-1"
                            previewClassName="overflow-hidden text-ellipsis whitespace-nowrap text-sm font-medium text-stone-900"
                          />
                          {entry.parse_status === "parsed" ? null : <StatusBadge status={entry.parse_status} />}
                          <WarningDot warnings={entry.warnings} label="Entry warnings" />
                        </div>
                        <p className="mt-1 text-xs text-stone-500">
                          {entry.occurred_time ? `${entry.occurred_time} / ` : ""}
                          {format(new Date(entry.created_at), "p")}
                        </p>
                      </div>
                      {entry.is_active ? (
                        <div className="flex items-center gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label="Edit note"
                            onClick={() => {
                              setEditingId(entry.id);
                              setEditNote(entry.raw_note);
                            }}
                          >
                            <Pencil size={15} />
                          </Button>
                          <Button size="icon" variant="ghost" aria-label="Delete note" onClick={() => startTransition(() => removeEntry(entry.id))}>
                            <Trash2 size={15} />
                          </Button>
                        </div>
                      ) : null}
                    </div>

                    {isEditing ? (
                      <div className="mt-3 space-y-2">
                        <Textarea value={editNote} onChange={(event) => setEditNote(event.target.value)} />
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => startTransition(() => saveEdit(entry.id))} disabled={!editNote.trim()}>
                            Save
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        {entry.parsed_items.length ? (
                          <div className="mt-3 space-y-2">
                            {entry.parsed_items.map((item, index) => (
                              <div key={`${entry.id}-${index}`} className="rounded-md bg-stone-50 px-3 py-2">
                                <div className="flex items-start gap-2">
                                  <FullTextDialog
                                    title="Parsed item"
                                    text={item.label}
                                    className="min-w-0 flex-1"
                                    previewClassName="break-words text-sm font-medium text-stone-900"
                                  />
                                  <WarningDot warnings={item.warnings} label={`${item.label} warnings`} className="-mt-1 shrink-0" />
                                </div>
                                <p className="mt-1 text-xs text-stone-500">
                                  {item.kind === "exercise"
                                    ? item.exerciseCalories != null
                                      ? `${item.exerciseCalories} kcal burn`
                                      : "Exercise recorded"
                                    : formatFoodNutrition(item)}
                                </p>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="mt-3 rounded-md bg-stone-50 px-3 py-2 text-sm text-stone-600">
                            {entry.parse_status === "failed" ? "Saved, but this note still needs clarification before it can be structured." : "Awaiting structured result."}
                          </p>
                        )}
                        <FullTextDialog
                          title="Raw note"
                          text={entry.raw_note}
                          className="mt-3"
                          previewClassName="break-words text-sm text-stone-500"
                          description="This is the original note that was saved before HealthLog structured it."
                        />
                      </>
                    )}
                  </article>
                );
              })
            ) : (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-stone-200 bg-stone-50/50 p-8 text-center transition-all duration-200">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-stone-100 text-stone-400">
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
                <p className="mt-3 text-sm font-medium text-stone-900 font-sans">Your health log is empty today</p>
                <p className="mt-1 text-xs text-stone-500 max-w-[240px] font-sans">
                  Type a quick note below to log your meals, drinks, or workouts.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

function MetricRow({
  icon,
  label,
  value,
  info,
  caption,
  percent,
  strong = false,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  info: string;
  caption?: string;
  percent?: number | null;
  strong?: boolean;
}) {
  return (
    <div className="border-b border-stone-200 px-3 py-2.5 last:border-b-0">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="text-stone-500">{icon}</span>
          <div className="min-w-0">
            <p className={`text-sm text-stone-900 ${strong ? "font-semibold" : "font-medium"}`}>{label}</p>
            {caption ? <p className="mt-0.5 text-xs text-stone-500">{caption}</p> : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {percent != null ? <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-medium text-stone-500">{percent}%</span> : null}
          <p className={`text-sm text-stone-900 ${strong ? "font-bold" : "font-semibold"}`}>{value}</p>
          <InfoButton title={label} description={<p>{info}</p>} />
        </div>
      </div>
      {percent != null ? (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-stone-100">
          <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.min(Math.max(percent, 0), 100)}%` }} />
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
