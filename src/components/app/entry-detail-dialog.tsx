"use client";

import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { NutritionIcons } from "@/components/app/nutrition-icons";
import { WarningDot } from "@/components/app/warning-dot";
import { getDisplayNutrition } from "@/lib/calculations";

type Warning = { code: string; message: string; improveWith?: string };

type EntryItem = {
  kind: "food" | "water" | "exercise" | "note";
  label: string;
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
};

type Entry = {
  raw_note: string;
  occurred_time: string | null;
  parsed_items: EntryItem[];
  parse_status: "pending" | "parsed" | "failed";
  created_at: string;
};

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

export function EntryDetailDialog({
  entry,
  trigger,
}: {
  entry: Entry;
  trigger: React.ReactNode;
}) {
  const timeLabel = entry.occurred_time ?? format(new Date(entry.created_at), "p");

  return (
    <Dialog>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{timeLabel}</DialogTitle>
        </DialogHeader>
        <div className="mt-1 space-y-4">

          {/* AI Summary */}
          <div>
            <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-stone-400">AI Summary</p>
            {entry.parse_status === "pending" ? (
              <p className="text-sm italic text-stone-400">Parsing note…</p>
            ) : entry.parse_status === "failed" || !entry.parsed_items.length ? (
              <p className="text-sm italic text-stone-400">Could not parse this note.</p>
            ) : (
              <div className="space-y-2">
                {entry.parsed_items.map((item, i) => (
                  <div key={i} className="rounded-lg border border-stone-200 bg-stone-50/60 px-3 py-2">
                    <div className="flex items-start justify-between gap-2">
                      <p className="break-words text-sm font-semibold text-stone-900">{item.label}</p>
                      <WarningDot warnings={item.warnings} label={`${item.label} warnings`} className="-mt-0.5 shrink-0" />
                    </div>
                    <div className="mt-1">
                      {item.kind === "exercise" ? (
                        <p className="text-xs text-stone-500">
                          {item.exerciseCalories != null
                            ? `${item.exerciseCalories} kcal burn`
                            : "Exercise recorded"}
                        </p>
                      ) : (
                        <NutritionIcons data={getItemNutritionData(item)} />
                      )}
                    </div>
                    {item.remarks && (
                      <p className="mt-1 text-[11px] italic text-stone-400">{item.remarks}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Raw Note */}
          <div>
            <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-stone-400">Raw Note</p>
            <p className="break-words text-sm leading-relaxed text-stone-700">{entry.raw_note}</p>
          </div>

        </div>
      </DialogContent>
    </Dialog>
  );
}
