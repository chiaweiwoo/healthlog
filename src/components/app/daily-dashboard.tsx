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
import { atwaterFactors, getDisplayNutrition } from "@/lib/calculations";

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
  if (parts.length) return parts.join(" | ");
  return "Estimate unavailable";
}

function formatBreakdownDetail(item: EntryItem, section: "food" | "water" | "exercise") {
  if (section === "water") return item.waterMl != null ? `${item.waterMl} ml` : "Water contribution recorded";
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

function getCaloriesCaption(summary: Summary) {
  if (!summary) return undefined;
  if (summary.breakdown.meta?.caloriesIncomplete || (summary.breakdown.meta?.unparsedEntryCount ?? 0) > 0) {
    return "Known total so far";
  }
  return "Atwater-based total";
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
  const [error, setError] = useState<string | null>(null);
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
    setError(null);
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
        setError(errorMsg);
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
    setError(null);
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
        setError(errorMsg);
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

  const breakdownSections = [
    { key: "food", label: "Food", items: summary?.breakdown?.food ?? [] },
    { key: "water", label: "Water", items: summary?.breakdown?.water ?? [] },
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
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <SummaryTile
                  icon={<Flame size={16} />}
                  label="Calories"
                  value={`${summary?.calories ?? 0} kcal`}
                  caption={getCaloriesCaption(summary)}
                />
                <SummaryTile icon={<Droplets size={16} />} label="Water" value={`${summary?.water_ml ?? 0} ml`} />
                <SummaryTile icon={<Sparkles size={16} />} label="Exercise" value={`${summary?.exercise_calories ?? 0} kcal`} />
                <SummaryTile
                  icon={<Timer size={16} />}
                  label="Deficit"
                  value={getDeficitLabel(summary)}
                  caption="TDEE - intake"
                  warning={<WarningDot warnings={summary?.warnings} label="Daily summary warnings" />}
                />
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-lg bg-stone-50 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-stone-900">Calorie breakdown</p>
                    <p className="mt-1 text-xs text-stone-500">Known totals from protein, fat, carbs, and alcohol.</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <InfoButton
                      title="How calories are calculated"
                      description={
                        <>
                          <p>Food calories use the general Atwater system when breakdown grams are available.</p>
                          <ul className="list-disc space-y-1 pl-4">
                            <li>Protein: {atwaterFactors.protein} kcal per gram</li>
                            <li>Fat: {atwaterFactors.fat} kcal per gram</li>
                            <li>Carbs: {atwaterFactors.carbs} kcal per gram</li>
                            <li>Alcohol: {atwaterFactors.alcohol} kcal per gram</li>
                          </ul>
                          <p>If a food has only a calorie estimate and no macro breakdown yet, HealthLog keeps that calorie estimate and marks the breakdown as incomplete.</p>
                        </>
                      }
                    />
                    <WarningDot warnings={summary?.warnings} label="Calorie breakdown warnings" />
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <BreakdownStat
                    icon={<Drumstick size={16} />}
                    label="Protein"
                    grams={summary?.protein_g ?? 0}
                    calories={Math.round((summary?.protein_g ?? 0) * atwaterFactors.protein)}
                    info="Protein contributes 4 kcal per gram."
                  />
                  <BreakdownStat
                    icon={<Droplet size={16} />}
                    label="Fat"
                    grams={summary?.fat_g ?? 0}
                    calories={Math.round((summary?.fat_g ?? 0) * atwaterFactors.fat)}
                    info="Fat contributes 9 kcal per gram."
                  />
                  <BreakdownStat
                    icon={<Wheat size={16} />}
                    label="Carbs"
                    grams={summary?.carbs_g ?? 0}
                    calories={Math.round((summary?.carbs_g ?? 0) * atwaterFactors.carbs)}
                    info="Carbohydrates contribute 4 kcal per gram."
                  />
                  <BreakdownStat
                    icon={<Martini size={16} />}
                    label="Alcohol"
                    grams={summary?.alcohol_g ?? 0}
                    calories={Math.round((summary?.alcohol_g ?? 0) * atwaterFactors.alcohol)}
                    info="Alcohol contributes 7 kcal per gram when present."
                  />
                </div>
              </div>

              <div className="space-y-2">
                {breakdownSections.map((section) => (
                  <div key={section.key} className="rounded-md border border-stone-200">
                    <button
                      className="flex w-full items-center justify-between px-3 py-3 text-left text-sm font-medium text-stone-800"
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
              {error ? <p className="text-sm text-red-600">{error}</p> : null}
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
                          <StatusBadge status={entry.parse_status} />
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
                                  {item.kind === "water"
                                    ? item.waterMl != null
                                      ? `${item.waterMl} ml`
                                      : "Water recorded"
                                    : item.kind === "exercise"
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
                        {entry.parse_error ? <p className="mt-2 text-xs text-amber-700">{entry.parse_error}</p> : null}
                      </>
                    )}
                  </article>
                );
              })
            ) : (
              <p className="text-sm text-stone-500">No entries for this date yet.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

function SummaryTile({
  icon,
  label,
  value,
  warning,
  caption,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  warning?: ReactNode;
  caption?: string;
}) {
  return (
    <div className="min-w-0 rounded-md bg-stone-50 p-3">
      <div className="flex items-center justify-between gap-2 text-stone-500">
        <span>{icon}</span>
        {warning}
      </div>
      <p className="mt-3 text-xs font-medium uppercase tracking-wide text-stone-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-stone-900">{value}</p>
      {caption ? <p className="mt-1 text-xs text-stone-500">{caption}</p> : null}
    </div>
  );
}

function BreakdownStat({
  icon,
  label,
  grams,
  calories,
  info,
}: {
  icon: ReactNode;
  label: string;
  grams: number;
  calories: number;
  info: string;
}) {
  return (
    <div className="rounded-md border border-stone-200 bg-white p-3">
      <div className="flex items-center justify-between gap-2 text-stone-500">
        <span>{icon}</span>
        <InfoButton title={label} description={<p>{info}</p>} />
      </div>
      <p className="mt-3 text-xs font-medium uppercase tracking-wide text-stone-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-stone-900">{grams} g</p>
      <p className="mt-1 text-xs text-stone-500">{calories} kcal</p>
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
