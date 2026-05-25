import { format } from "date-fns";
import { getDisplayNutrition } from "@/lib/calculations";
import { ParsedDailyItem } from "@/lib/schemas";
import { round } from "@/lib/utils";

export type EntryTableMetric = "calories" | "water" | "protein" | "fat" | "carbs" | "alcohol" | "exercise";

export type EntryTableEntry = {
  id: string;
  occurred_time: string | null;
  parsed_items: ParsedDailyItem[];
  parse_status: "pending" | "parsed" | "failed";
  is_active: boolean;
  created_at: string;
};

type EntryTableMeasurement = {
  value: number | null;
  unit: string;
};

export type EntryTableRow = {
  id: string;
  entryId: string;
  label: string;
  time: string;
  measurements: Record<EntryTableMetric, EntryTableMeasurement>;
};

function isKnownNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function normalizeTime(value: string | null | undefined) {
  if (!value) return null;
  const hhmm = value.match(/^(\d{2}):(\d{2})/);
  if (hhmm) return `${hhmm[1]}:${hhmm[2]}`;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return format(parsed, "HH:mm");
}

function getMeasurement(item: ParsedDailyItem, metric: EntryTableMetric): EntryTableMeasurement {
  const derived = getDisplayNutrition(item);

  if (metric === "water") {
    return {
      value: isKnownNumber(item.waterMl) ? round(item.waterMl) : null,
      unit: "ml",
    };
  }

  if (metric === "exercise") {
    return {
      value: isKnownNumber(item.exerciseCalories) ? round(item.exerciseCalories) : null,
      unit: "kcal",
    };
  }

  if (metric === "calories") {
    return {
      value: isKnownNumber(derived.calories) ? round(derived.calories) : null,
      unit: "kcal",
    };
  }

  if (metric === "protein") {
    return {
      value: isKnownNumber(derived.proteinG) ? round(derived.proteinG, 1) : null,
      unit: "g",
    };
  }

  if (metric === "fat") {
    return {
      value: isKnownNumber(derived.fatG) ? round(derived.fatG, 1) : null,
      unit: "g",
    };
  }

  if (metric === "carbs") {
    return {
      value: isKnownNumber(derived.carbsG) ? round(derived.carbsG, 1) : null,
      unit: "g",
    };
  }

  return {
    value: isKnownNumber(derived.alcoholG) ? round(derived.alcoholG, 1) : null,
    unit: "g",
  };
}

export function flattenEntriesForTable(entries: EntryTableEntry[]): EntryTableRow[] {
  return entries
    .filter((entry) => entry.is_active && entry.parse_status === "parsed")
    .flatMap((entry) =>
      entry.parsed_items.map((item, index) => ({
        id: `${entry.id}:${index}`,
        entryId: entry.id,
        label: item.label,
        time: normalizeTime(item.occurredTime) ?? normalizeTime(entry.occurred_time) ?? format(new Date(entry.created_at), "HH:mm"),
        measurements: {
          calories: getMeasurement(item, "calories"),
          water: getMeasurement(item, "water"),
          protein: getMeasurement(item, "protein"),
          fat: getMeasurement(item, "fat"),
          carbs: getMeasurement(item, "carbs"),
          alcohol: getMeasurement(item, "alcohol"),
          exercise: getMeasurement(item, "exercise"),
        },
      })),
    );
}

export function sumEntryTableMetric(rows: EntryTableRow[], metric: EntryTableMetric) {
  return rows.reduce((sum, row) => sum + (row.measurements[metric].value ?? 0), 0);
}

export function formatEntryTableMetricValue(value: number | null, unit: string) {
  if (value === null || value === 0) return "";
  const display = Number.isInteger(value) ? String(value) : String(round(value, 1));
  return `${display} ${unit}`;
}
