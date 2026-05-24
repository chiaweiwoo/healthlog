"use client";

import { format } from "date-fns";
import { ChevronDown, Droplets, Flame, NotebookPen, Sparkles, Timer } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { WarningDot } from "@/components/app/warning-dot";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type Warning = { code: string; message: string; improveWith?: string };

type Entry = {
  id: string;
  raw_note: string;
  occurred_time: string | null;
  parsed_items: Array<{
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
  }>;
  confidence: number;
  warnings: Warning[];
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
    food?: Entry["parsed_items"];
    water?: Entry["parsed_items"];
    exercise?: Entry["parsed_items"];
  };
} | null;

export function DailyDashboard({
  initialDate,
  initialEntries,
  initialSummary,
}: {
  initialDate: string;
  initialEntries: Entry[];
  initialSummary: Summary;
}) {
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [entries, setEntries] = useState(initialEntries);
  const [summary, setSummary] = useState<Summary>(initialSummary);
  const [note, setNote] = useState("");
  const [isPending, startTransition] = useTransition();
  const [expanded, setExpanded] = useState<string | null>("food");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (selectedDate === initialDate) return;
    startTransition(async () => {
      const response = await fetch(`/api/daily-entries?date=${selectedDate}`);
      const body = (await response.json()) as { entries: Entry[]; summary: Summary };
      setEntries(body.entries ?? []);
      setSummary(body.summary ?? null);
    });
  }, [initialDate, selectedDate]);

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
      | { entry?: Entry; summary?: Summary; error?: string }
      | null;
    if (!response.ok) {
      setError(body?.error ?? "Could not save note.");
      return;
    }
    const newEntry = body?.entry;
    if (newEntry) {
      setEntries((current) => [newEntry, ...current]);
    }
    setSummary(body?.summary ?? null);
    setNote("");
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
    <main className="mx-auto max-w-6xl px-3 py-4 sm:px-4 sm:py-6">
      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <section className="space-y-4">
          <Card className="overflow-hidden">
            <CardHeader className="space-y-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-sm font-medium text-emerald-700">{format(new Date(selectedDate), "EEE, d MMM")}</p>
                  <CardTitle className="mt-1 text-xl">How today is going</CardTitle>
                </div>
                <Input
                  aria-label="Select date"
                  className="w-full bg-stone-50 sm:w-40"
                  type="date"
                  value={selectedDate}
                  onChange={(event) => setSelectedDate(event.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <SummaryTile icon={<Flame size={16} />} label="Calories" value={String(summary?.calories ?? 0)} />
                <SummaryTile icon={<Droplets size={16} />} label="Water" value={`${summary?.water_ml ?? 0} ml`} />
                <SummaryTile icon={<Sparkles size={16} />} label="Exercise" value={`${summary?.exercise_calories ?? 0} kcal`} />
                <SummaryTile
                  icon={<Timer size={16} />}
                  label="Balance"
                  value={summary?.estimated_deficit == null ? "Incomplete" : `${summary.estimated_deficit} kcal`}
                  warning={<WarningDot warnings={summary?.warnings} />}
                />
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-lg bg-stone-50 p-3">
                <div className="grid grid-cols-3 gap-2 text-sm">
                  <MacroStat label="Protein" value={`${summary?.protein_g ?? 0} g`} />
                  <MacroStat label="Fat" value={`${summary?.fat_g ?? 0} g`} />
                  <MacroStat label="Carbs" value={`${summary?.carbs_g ?? 0} g`} />
                </div>
                <p className="mt-3 text-xs text-stone-500">Estimated TDEE: {summary?.tdee ?? "Incomplete"}</p>
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
                                  <WarningDot warnings={item.warnings} />
                                </div>
                                <p className="mt-1 text-xs text-stone-500">
                                  {item.quantity ?? item.waterMl ?? item.exerciseCalories ?? "Recorded"}
                                </p>
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

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Entries</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {entries.length ? (
              entries.map((entry) => (
                <article
                  key={entry.id}
                  className={`rounded-lg border p-3 ${entry.is_active ? "border-stone-200 bg-white" : "border-stone-100 bg-stone-50 opacity-60"}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-stone-900">{entry.raw_note}</p>
                        <WarningDot warnings={entry.warnings} />
                      </div>
                      <p className="mt-1 text-xs text-stone-500">
                        {entry.occurred_time ? `${entry.occurred_time} - ` : ""}
                        {format(new Date(entry.created_at), "p")}
                      </p>
                    </div>
                    {entry.is_active ? (
                      <Button size="sm" variant="ghost" onClick={() => startTransition(() => removeEntry(entry.id))}>
                        Delete
                      </Button>
                    ) : null}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {entry.parsed_items.map((item, index) => (
                      <span key={`${entry.id}-${index}`} className="rounded-full bg-stone-100 px-2 py-1 text-xs text-stone-700">
                        {item.label}
                      </span>
                    ))}
                  </div>
                </article>
              ))
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
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  warning?: React.ReactNode;
}) {
  return (
    <div className="rounded-md bg-stone-50 p-3">
      <div className="flex items-center justify-between gap-2 text-stone-500">
        <span>{icon}</span>
        {warning}
      </div>
      <p className="mt-3 text-xs font-medium uppercase tracking-wide text-stone-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-stone-900">{value}</p>
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
