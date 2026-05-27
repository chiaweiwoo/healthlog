import { format } from "date-fns";
import { getDisplayNutrition } from "@/lib/calculations";
import { ParsedDailyItem, Warning } from "@/lib/schemas";
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
  warnings: Warning[];
  caloriesDisplayValue: EntryTableMeasurement;
  waterDisplayValue: EntryTableMeasurement;
  measurements: Record<EntryTableMetric, EntryTableMeasurement>;
};

function isKnownNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function normalizeTime(value: string | null | undefined) {
  if (!value) return null;
  const hhmm = value.match(/^(\d{2}):(\d{2})/);
  if (hhmm) {
    const hours = Number(hhmm[1]);
    const minutes = Number(hhmm[2]);
    if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
      return `${hhmm[1]}:${hhmm[2]}`;
    }
    return null;
  }
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
      entry.parsed_items.map((item, index) => {
        const caloriesMeasurement = getMeasurement(item, "calories");
        const waterMeasurement = getMeasurement(item, "water");
        const proteinMeasurement = getMeasurement(item, "protein");
        const fatMeasurement = getMeasurement(item, "fat");
        const carbsMeasurement = getMeasurement(item, "carbs");
        const alcoholMeasurement = getMeasurement(item, "alcohol");
        const exerciseMeasurement = getMeasurement(item, "exercise");

        return {
          id: `${entry.id}:${index}`,
          entryId: entry.id,
          label: item.label,
          time: normalizeTime(item.occurredTime) ?? normalizeTime(entry.occurred_time) ?? format(new Date(entry.created_at), "HH:mm"),
          warnings: item.warnings ?? [],
          caloriesDisplayValue: {
            value: exerciseMeasurement.value != null ? -exerciseMeasurement.value : caloriesMeasurement.value,
            unit: "kcal",
          },
          waterDisplayValue: waterMeasurement,
          measurements: {
            calories: caloriesMeasurement,
            water: waterMeasurement,
            protein: proteinMeasurement,
            fat: fatMeasurement,
            carbs: carbsMeasurement,
            alcohol: alcoholMeasurement,
            exercise: exerciseMeasurement,
          },
        };
      }),
    );
}

export function formatEntryTableMetricValue(value: number | null, unit: string) {
  if (value === null || value === 0) return "";
  const display = Number.isInteger(value) ? String(value) : String(round(value, 1));
  return `${display} ${unit}`;
}
