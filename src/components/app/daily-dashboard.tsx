"use client";

import { format } from "date-fns";
import { ChevronDown, Droplets, Flame, NotebookPen, Pencil, Sparkles, Timer, Trash2 } from "lucide-react";
import { useEffect, useState, useSyncExternalStore, useTransition } from "react";
import { WarningDot } from "@/components/app/warning-dot";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

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
  };
  warnings?: Warning[];
  remarks?: string | null;
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

function formatNutrition(item: EntryItem) {
  if (item.kind === "food") {
    const parts: string[] = [];
    if (item.nutrition?.calories != null) parts.push(`${item.nutrition.calories} kcal`);
    if (item.nutrition?.proteinG != null) parts.push(`P ${item.nutrition.proteinG}g`);
    if (item.nutrition?.fatG != null) parts.push(`F ${item.nutrition.fatG}g`);
    if (item.nutrition?.carbsG != null) parts.push(`C ${item.nutrition.carbsG}g`);
    if (parts.length) return parts.join(" · ");
    return "Estimate unavailable";
  }
  if (item.kind === "water") return item.waterMl != null ? `${item.waterMl} ml` : "Water recorded";
  if (item.kind === "exercise") return item.exerciseCalories != null ? `${item.exerciseCalories} kcal burn` : "Exercise recorded";
  return item.quantity ?? item.remarks ?? "Recorded";
}

function getEnergyGapLabel(summary: Summary) {
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
  return `${summary.estimated_deficit} kcal`;
}

function getEntryHeadline(entry: Entry) {
  if (entry.parsed_items.length) {
    return entry.parsed_items.map((item) => item.label).join(" · ");
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
  const selectedDate = selectedDateOverride ?? browserToday;

  useEffect(() => {
    if (selectedDate === initialDate && selectedDateOverride === null) return;
    startTransition(async () => {
      const response = await fetch(`/api/daily-entries?date=${selectedDate}`);
      const body = (await response.json()) as { entries: Entry[]; summary: Summary };
      setEntries(body.entries ?? []);
      setSummary(body.summary ?? null);
    });
  }, [initialDate, selectedDate, selectedDateOverride]);

  async function submitNote() {
    setError(null);
    const rawNote = note.trim();
    if (!rawNote) return;
    const response = await fetch("/api/daily-entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: selectedDate, rawNote }),
    });
    const body = (await response.json().catch(() => null)) as
      | { entry?: Entry; summary?: Summary; error?: string; requestId?: string }
      | null;
    if (!response.ok) {
      setError(body?.requestId ? `${body.error ?? "Could not save note."} (${body.requestId})` : (body?.error ?? "Could not save note."));
      return;
    }
    const newEntry = body?.entry;
    if (newEntry) {
      setEntries((current) => [newEntry, ...current.filter((entry) => entry.id !== newEntry.id)]);
    }
    setSummary(body?.summary ?? null);
    setNote("");
  }

  async function saveEdit(id: string) {
    const rawNote = editNote.trim();
    if (!rawNote) return;
    setError(null);
    const response = await fetch("/api/daily-entries", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, rawNote }),
    });
    const body = (await response.json().catch(() => null)) as
      | { entry?: Entry; summary?: Summary; error?: string; requestId?: string }
      | null;
    if (!response.ok || !body?.entry) {
      setError(body?.requestId ? `${body.error ?? "Could not update note."} (${body.requestId})` : (body?.error ?? "Could not update note."));
      return;
    }
    setEntries((current) => current.map((entry) => (entry.id === id ? body.entry! : entry)));
    setSummary(body.summary ?? null);
    setEditingId(null);
    setEditNote("");
  }

  async function removeEntry(id: string) {
    const response = await fetch(`/api/daily-entries?id=${id}`, { method: "DELETE" });
    const body = (await response.json()) as { summary: Summary };
    setEntries((current) => current.map((entry) => (entry.id === id ? { ...entry, is_active: false } : entry)));
    setSummary(body.summary);
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
                <Input
                  aria-label="Select date"
                  className="w-full bg-stone-50 sm:w-40"
                  type="date"
                  value={selectedDate}
                  onChange={(event) => setSelectedDateOverride(event.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <SummaryTile icon={<Flame size={16} />} label="Calories" value={summary?.breakdown.meta?.caloriesIncomplete ? "Estimate incomplete" : String(summary?.calories ?? 0)} />
                <SummaryTile icon={<Droplets size={16} />} label="Water" value={`${summary?.water_ml ?? 0} ml`} />
                <SummaryTile icon={<Sparkles size={16} />} label="Exercise" value={`${summary?.exercise_calories ?? 0} kcal`} />
                <SummaryTile
                  icon={<Timer size={16} />}
                  label="Energy gap"
                  value={getEnergyGapLabel(summary)}
                  caption="TDEE - intake"
                  warning={<WarningDot warnings={summary?.warnings} label="Daily summary warnings" />}
                />
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-lg bg-stone-50 p-3">
                <div className="grid grid-cols-3 gap-2 text-sm">
                  <MacroStat label="Protein" value={summary?.breakdown.meta?.macrosIncomplete ? "Unavailable" : `${summary?.protein_g ?? 0} g`} />
                  <MacroStat label="Fat" value={summary?.breakdown.meta?.macrosIncomplete ? "Unavailable" : `${summary?.fat_g ?? 0} g`} />
                  <MacroStat label="Carbs" value={summary?.breakdown.meta?.macrosIncomplete ? "Unavailable" : `${summary?.carbs_g ?? 0} g`} />
                </div>
                <p className="mt-3 text-xs text-stone-500">
                  Estimated TDEE: {summary?.tdee ?? "Profile needed"}
                </p>
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
                              <div key={`${section.key}-${index}`} className="rounded-md bg-stone-50 px-3 py-2">
                                <div className="flex items-center gap-2">
                                  <p className="font-medium text-stone-900">{item.label}</p>
                                  <WarningDot warnings={item.warnings} label={`${item.label} warnings`} />
                                </div>
                                <p className="mt-1 text-xs text-stone-500">{formatNutrition(item)}</p>
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
              <CardTitle className="text-lg">Quick note</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea
                placeholder="8am kopi, mixed English/Chinese food names, 9000 steps after dinner..."
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
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
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-sm font-medium text-stone-900">{getEntryHeadline(entry)}</p>
                          <StatusBadge status={entry.parse_status} />
                          <WarningDot warnings={entry.warnings} label="Entry warnings" />
                        </div>
                        <p className="mt-1 text-xs text-stone-500">
                          {entry.occurred_time ? `${entry.occurred_time} · ` : ""}
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
                                <div className="flex items-center gap-2">
                                  <p className="text-sm font-medium text-stone-900">{item.label}</p>
                                  <WarningDot warnings={item.warnings} label={`${item.label} warnings`} />
                                </div>
                                <p className="mt-1 text-xs text-stone-500">{formatNutrition(item)}</p>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="mt-3 rounded-md bg-stone-50 px-3 py-2 text-sm text-stone-600">
                            {entry.parse_status === "failed" ? "Saved, but this note still needs clarification before it can be structured." : "Awaiting structured result."}
                          </p>
                        )}
                        <p className="mt-3 text-sm text-stone-500">{entry.raw_note}</p>
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
  icon: React.ReactNode;
  label: string;
  value: string;
  warning?: React.ReactNode;
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

function MacroStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-stone-500">{label}</p>
      <p className="mt-1 font-medium text-stone-900">{value}</p>
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
