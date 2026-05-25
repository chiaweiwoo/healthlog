import { DailyParseResult, Warning } from "@/lib/schemas";

export const BACKDATED_ENTRY_FALLBACK_TIME = "23:59";

type BackdatedTimeContext = {
  entryDate: string;
  clientToday: string;
};

function isStrictTime(value: string | null | undefined): value is string {
  if (!value) return false;
  const match = value.match(/^(\d{2}):(\d{2})$/);
  if (!match) return false;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
}

function buildTimeNormalizationWarning(scope: "entry" | "item"): Warning {
  return {
    code: "time_normalized",
    message:
      scope === "entry"
        ? `Recorded time was outside the day, so it was reset to ${BACKDATED_ENTRY_FALLBACK_TIME}.`
        : `One item time was outside the day, so it was reset to ${BACKDATED_ENTRY_FALLBACK_TIME}.`,
    improveWith: "Use a 24-hour time like 08:00 or 19:30 if you want to keep a specific recorded time.",
  };
}

function isBackdatedEntry(context: BackdatedTimeContext) {
  return context.entryDate < context.clientToday;
}

function normalizeEntryOccurredTime(
  value: string | null | undefined,
  context: BackdatedTimeContext,
  warnings: Warning[],
) {
  if (value == null || value === "") {
    return isBackdatedEntry(context) ? BACKDATED_ENTRY_FALLBACK_TIME : null;
  }
  if (isStrictTime(value)) {
    return value;
  }
  warnings.push(buildTimeNormalizationWarning("entry"));
  return BACKDATED_ENTRY_FALLBACK_TIME;
}

function normalizeItemOccurredTime(value: string | null | undefined, warnings: Warning[]) {
  if (value == null || value === "") {
    return undefined;
  }
  if (isStrictTime(value)) {
    return value;
  }
  warnings.push(buildTimeNormalizationWarning("item"));
  return BACKDATED_ENTRY_FALLBACK_TIME;
}

export function normalizeDailyParseResultTimes(
  parsed: DailyParseResult,
  context: BackdatedTimeContext,
): DailyParseResult {
  const warnings = [...parsed.warnings];
  const items = parsed.items.map((item) => {
    const itemWarnings = [...(item.warnings ?? [])];
    const occurredTime = normalizeItemOccurredTime(item.occurredTime, itemWarnings);
    return {
      ...item,
      occurredTime,
      warnings: itemWarnings,
    };
  });

  return {
    ...parsed,
    occurredTime: normalizeEntryOccurredTime(parsed.occurredTime, context, warnings),
    items,
    warnings,
  };
}

export function resolveFailedEntryOccurredTime(context: BackdatedTimeContext) {
  return isBackdatedEntry(context) ? BACKDATED_ENTRY_FALLBACK_TIME : null;
}
