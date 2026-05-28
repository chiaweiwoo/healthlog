import { parseISO } from "date-fns";
import { Warning, Reasoning, AdminAlert } from "@/lib/schemas";

const INVALID_TIME_FALLBACK = "23:59";

function isBoundedTime(value: string) {
  const match = value.match(/^(\d{2}):(\d{2})$/);
  if (!match) return false;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
}

function normalizeOccurredTime(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const trimmed = value.trim();
  const hhmm = trimmed.match(/^(\d{2}):(\d{2})/);
  if (hhmm) {
    const candidate = `${hhmm[1]}:${hhmm[2]}`;
    return isBoundedTime(candidate) ? candidate : INVALID_TIME_FALLBACK;
  }
  const maybeDate = Date.parse(trimmed);
  if (!Number.isNaN(maybeDate)) {
    const parsed = parseISO(trimmed);
    return `${String(parsed.getUTCHours()).padStart(2, "0")}:${String(parsed.getUTCMinutes()).padStart(2, "0")}`;
  }
  return INVALID_TIME_FALLBACK;
}

function includesInvalidTimeWarning(warnings: Array<{ code?: string }>) {
  return warnings.some((warning) => warning.code === "time_normalized");
}

function withInvalidTimeWarning<T extends { warnings: Array<{ code: string; message: string; improveWith?: string }> }>(
  target: T,
  rawTime: unknown,
) {
  if (typeof rawTime !== "string" || !rawTime.trim()) return target;
  const normalized = normalizeOccurredTime(rawTime);
  if (normalized !== INVALID_TIME_FALLBACK || includesInvalidTimeWarning(target.warnings)) return target;
  return {
    ...target,
    warnings: [
      ...target.warnings,
      {
        code: "time_normalized",
        message: `Recorded time was outside the day, so it was reset to ${INVALID_TIME_FALLBACK}.`,
        improveWith: "Use a 24-hour time like 08:00 or 19:30 if you want to keep a specific recorded time.",
      },
    ],
  };
}

function normalizeActionType(value: unknown) {
  if (typeof value !== "string") return "create";
  const normalized = value.toLowerCase().trim();
  if (["create", "clarify"].includes(normalized)) return normalized;
  // Map removed values gracefully so old data still loads
  if (["edit", "update", "updated", "change", "changed", "delete", "remove", "removed"].includes(normalized)) return "create";
  if (["eat", "drink", "exercise", "log", "record", "add"].includes(normalized)) return "create";
  return "create";
}

function normalizeWarnings(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((warning): Warning | null => {
      if (typeof warning === "string") {
        return { code: "model_warning", message: warning };
      }
      if (warning && typeof warning === "object") {
        const record = warning as Record<string, unknown>;
        const message = typeof record.message === "string" ? record.message : typeof record.warning === "string" ? record.warning : "";
        if (!message) return null;
        return {
          code: typeof record.code === "string" ? record.code : "model_warning",
          message,
          improveWith: typeof record.improveWith === "string" ? record.improveWith : undefined,
        };
      }
      return null;
    })
    .filter((warning): warning is Warning => warning !== null);
}

function normalizeNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const normalized = value.replace(/,/g, "").trim();
    const parsed = Number(normalized);
    if (Number.isFinite(parsed)) return parsed;
    const firstNumber = normalized.match(/-?\d+(\.\d+)?/);
    if (firstNumber) {
      const extracted = Number(firstNumber[0]);
      if (Number.isFinite(extracted)) return extracted;
    }
  }
  return null;
}

function normalizeConfidence(value: unknown, fallback = 0.6) {
  if (typeof value === "number" && Number.isFinite(value)) {
    if (value >= 0 && value <= 1) return value;
    if (value > 1 && value <= 100) return value / 100;
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const candidates = [record.overall, record.profile, record.measurements];
    for (const candidate of candidates) {
      if (typeof candidate === "number" && Number.isFinite(candidate)) {
        if (candidate >= 0 && candidate <= 1) return candidate;
        if (candidate > 1 && candidate <= 100) return candidate / 100;
      }
    }
  }
  return fallback;
}

function normalizeRemarks(value: unknown) {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    const text = value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).join("; ");
    return text || null;
  }
  return null;
}

function normalizeProfileAction(value: unknown) {
  if (typeof value !== "string") return "update";
  const normalized = value.toLowerCase().trim();
  if (["add", "update", "delete", "clarify", "no_change"].includes(normalized)) return normalized;
  if (["remove", "clear"].includes(normalized)) return "delete";
  if (["keep", "ignore", "none"].includes(normalized)) return "no_change";
  return "update";
}

function hasOwn(record: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function normalizeMemoryCategory(value: unknown) {
  if (typeof value !== "string") return "other";
  const normalized = value.toLowerCase().trim().replace(/\s+/g, "_");
  if (["lifestyle", "diet", "exercise_context", "food_context", "medical_context", "preference", "other"].includes(normalized)) {
    return normalized;
  }
  if (["exercise", "workout", "activity_context"].includes(normalized)) return "exercise_context";
  if (["food", "cuisine"].includes(normalized)) return "food_context";
  if (["medical"].includes(normalized)) return "medical_context";
  return "other";
}

function normalizeReasoning(value: unknown): Reasoning {
  const fallback: Reasoning = { assumptions: [], profileSignalsUsed: [], unresolvedAmbiguities: [] };
  if (!value || typeof value !== "object") return fallback;
  const record = value as Record<string, unknown>;
  return {
    assumptions: Array.isArray(record.assumptions) ? record.assumptions.filter((s): s is string => typeof s === "string") : [],
    profileSignalsUsed: Array.isArray(record.profileSignalsUsed) ? record.profileSignalsUsed.filter((s): s is string => typeof s === "string") : [],
    unresolvedAmbiguities: Array.isArray(record.unresolvedAmbiguities) ? record.unresolvedAmbiguities.filter((s): s is string => typeof s === "string") : [],
  };
}

function normalizeAdminAlert(value: unknown): AdminAlert {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const severity = record.severity === "critical" ? "critical" : record.severity === "warn" ? "warn" : null;
  if (!severity || typeof record.code !== "string" || typeof record.message !== "string") return null;
  return { severity, code: record.code, message: record.message };
}

function normalizeActivityLevel(value: unknown) {
  if (typeof value !== "string") return undefined;
  return (
    {
      sedentary: "sedentary",
      low: "light",
      light: "light",
      moderate: "moderate",
      active: "active",
      very_active: "very_active",
      veryactive: "very_active",
      high: "very_active",
    } as const
  )[value.toLowerCase().replace(/\s+/g, "_") as keyof {
    sedentary: "sedentary";
    low: "light";
    light: "light";
    moderate: "moderate";
    active: "active";
    very_active: "very_active";
    veryactive: "very_active";
    high: "very_active";
  }];
}

function normalizeMemoryIdPart(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function buildSparseProfilePatch(profile: Record<string, unknown>) {
  const patch: Record<string, unknown> = {};

  if (hasOwn(profile, "age")) {
    const age = normalizeNumber(profile.age);
    if (age != null) patch.age = age;
  }

  const sexSource = hasOwn(profile, "sex") ? profile.sex : hasOwn(profile, "gender") ? profile.gender : undefined;
  if (sexSource === "male" || sexSource === "female") {
    patch.sex = sexSource;
  }

  if (hasOwn(profile, "heightCm") || hasOwn(profile, "height")) {
    const heightCm = normalizeNumber(profile.heightCm ?? profile.height);
    if (heightCm != null) patch.heightCm = heightCm;
  }

  if (hasOwn(profile, "weightKg") || hasOwn(profile, "weight")) {
    const weightKg = normalizeNumber(profile.weightKg ?? profile.weight);
    if (weightKg != null) patch.weightKg = weightKg;
  }

  if (hasOwn(profile, "activityLevel")) {
    const activityLevel = normalizeActivityLevel(profile.activityLevel);
    if (activityLevel) patch.activityLevel = activityLevel;
  }

  if (hasOwn(profile, "goal") && typeof profile.goal === "string" && profile.goal.trim()) {
    patch.goal = profile.goal;
  }

  if (hasOwn(profile, "country") && typeof profile.country === "string" && profile.country.trim()) {
    patch.country = profile.country;
  }

  if (hasOwn(profile, "city") && typeof profile.city === "string" && profile.city.trim()) {
    patch.city = profile.city.trim();
  }

  if (hasOwn(profile, "remarks")) {
    const remarks = normalizeRemarks(profile.remarks);
    if (remarks != null) patch.remarks = remarks;
  }

  return Object.keys(patch).length ? patch : undefined;
}

function inferMemoryCategory(label: string | null, value: string | null, fallback: ReturnType<typeof normalizeMemoryCategory>) {
  const text = `${label ?? ""} ${value ?? ""}`.toLowerCase();
  if (/(medication|medicine|meds|supplement|vitamin|pill|tablet|injury|injured|pain|sprain|fracture|recovery|physio|allergy)/.test(text)) {
    return "medical_context";
  }
  if (/(diet|food|meal|cuisine|vegetarian|vegan|halal|avoid|restriction)/.test(text)) {
    return "diet";
  }
  if (/(exercise|workout|run|running|gym|training|sport|sports|mobility|stretch)/.test(text)) {
    return "exercise_context";
  }
  if (/(sleep|shift|office|desk|commute|lifestyle|routine|work style|occupation)/.test(text)) {
    return "lifestyle";
  }
  return fallback;
}

function getNutritionSource(source: Record<string, unknown>) {
  const candidate =
    (source.nutrition && typeof source.nutrition === "object" ? source.nutrition : null) ??
    (source.nutrients && typeof source.nutrients === "object" ? source.nutrients : null) ??
    (source.macros && typeof source.macros === "object" ? source.macros : null) ??
    (source.macro && typeof source.macro === "object" ? source.macro : null);
  return candidate && typeof candidate === "object" ? (candidate as Record<string, unknown>) : source;
}

function normalizeMeasurementType(value: unknown) {
  if (typeof value !== "string") return "measurement";
  const normalized = value.toLowerCase().trim().replace(/\s+/g, "_");
  if (["weight", "body_weight"].includes(normalized)) return "weight";
  if (["height", "body_height"].includes(normalized)) return "height";
  if (["body_fat", "bodyfat", "body-fat"].includes(normalized)) return "body_fat";
  if (["waist", "hip", "chest", "thigh", "arm", "neck"].includes(normalized)) return normalized;
  return normalized;
}

export function normalizeDailyResult(raw: unknown) {
  const record = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const rawItems = Array.isArray(record.items) ? record.items : [];

  const items = rawItems.map((item, index) => {
    const source = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
    const nutritionSource = getNutritionSource(source);
    const kindInput = typeof source.kind === "string" ? source.kind.toLowerCase() : typeof source.type === "string" ? source.type.toLowerCase() : "note";
    const kind = kindInput === "meal" ? "food" : kindInput === "drink" ? "water" : kindInput;
    const normalizedItem = {
      id: typeof source.id === "string" ? source.id : `item-${index + 1}`,
      kind: ["food", "water", "exercise", "note"].includes(kind) ? kind : "note",
      label:
        typeof source.label === "string"
          ? source.label
          : typeof source.food === "string"
            ? source.food
            : typeof source.name === "string"
              ? source.name
              : "Unlabeled item",
      occurredTime: normalizeOccurredTime(source.occurredTime),
      quantity:
        typeof source.quantity === "string"
          ? source.quantity
          : typeof source.amount === "string"
            ? source.amount
            : typeof source.serving === "string"
              ? source.serving
              : null,
      nutrition: {
        calories: normalizeNumber(nutritionSource.calories ?? nutritionSource.kcal ?? nutritionSource.energyKcal ?? nutritionSource.energy),
        proteinG: normalizeNumber(nutritionSource.proteinG ?? nutritionSource.protein ?? nutritionSource.protein_g),
        fatG: normalizeNumber(nutritionSource.fatG ?? nutritionSource.fat ?? nutritionSource.fat_g),
        carbsG: normalizeNumber(nutritionSource.carbsG ?? nutritionSource.carbs ?? nutritionSource.carbohydrates ?? nutritionSource.carbs_g),
        alcoholG: normalizeNumber(
          nutritionSource.alcoholG ??
            nutritionSource.alcohol ??
            nutritionSource.alcohol_g ??
            nutritionSource.ethanol ??
            nutritionSource.alcoholContentG,
        ),
      },
      waterMl: normalizeNumber(source.waterMl ?? source.water ?? source.volumeMl),
      exerciseCalories: normalizeNumber(source.exerciseCalories ?? source.caloriesBurned ?? source.burnedCalories),
      confidence: normalizeConfidence(source.confidence, normalizeConfidence(record.confidence, 0.6)),
      warnings: normalizeWarnings(source.warnings),
      remarks: normalizeRemarks(source.remarks) ?? (typeof source.note === "string" ? source.note : null),
      metadata: source,
    };

    return withInvalidTimeWarning(normalizedItem, source.occurredTime);
  });

  const normalized = {
    occurredTime: normalizeOccurredTime(record.occurredTime),
    actionType: normalizeActionType(record.actionType),
    items,
    confidence: normalizeConfidence(record.confidence, 0.6),
    warnings: normalizeWarnings(record.warnings),
    remarks: normalizeRemarks(record.remarks),
    reasoning: normalizeReasoning(record.reasoning),
    adminAlert: normalizeAdminAlert(record.adminAlert),
  };

  return withInvalidTimeWarning(normalized, record.occurredTime);
}

export function normalizeProfileNoteResult(raw: unknown) {
  const record = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const profile = record.profile && typeof record.profile === "object" ? (record.profile as Record<string, unknown>) : undefined;
  const measurements = Array.isArray(record.measurements) ? record.measurements : [];
  const metadataUpserts = Array.isArray(record.metadataUpserts)
    ? record.metadataUpserts
    : Array.isArray(record.memory)
      ? record.memory
      : [];
  const overrides =
    record.overrides && typeof record.overrides === "object"
      ? (record.overrides as Record<string, unknown>)
      : record.profileOverrides && typeof record.profileOverrides === "object"
        ? (record.profileOverrides as Record<string, unknown>)
        : {};

  return {
    action: normalizeProfileAction(record.action ?? record.actionType),
    profile: profile ? buildSparseProfilePatch(profile) : undefined,
    metadataUpserts: metadataUpserts
      .map((item) => {
        const source = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
        const label =
          typeof source.label === "string"
            ? source.label
            : typeof source.key === "string"
              ? source.key
              : typeof source.name === "string"
                ? source.name
                : null;
        const value =
          typeof source.value === "string"
            ? source.value
            : typeof source.note === "string"
              ? source.note
              : typeof source.text === "string"
                ? source.text
                : null;
        if (!label || !value) return null;
        const fallbackCategory = normalizeMemoryCategory(source.category);
        const category = inferMemoryCategory(label, value, fallbackCategory);
        const generatedId = `memory-${normalizeMemoryIdPart(category)}-${normalizeMemoryIdPart(label) || "item"}`;
        return {
          id: typeof source.id === "string" && source.id.trim() ? source.id : generatedId,
          category,
          label,
          value,
          sourceNoteId: typeof source.sourceNoteId === "string" ? source.sourceNoteId : undefined,
          updatedAt:
            typeof source.updatedAt === "string"
              ? source.updatedAt
              : new Date().toISOString(),
        };
      })
      .filter(Boolean),
    metadataDeletes: [],
    overrides: {
      waterTargetMl: normalizeNumber(
        overrides.waterTargetMl ?? overrides.water_target_ml ?? overrides.waterTarget ?? overrides.water_ml,
      ) ?? undefined,
      bmr: normalizeNumber(overrides.bmr ?? overrides.basalMetabolicRate) ?? undefined,
      neatCalories: normalizeNumber(overrides.neatCalories ?? overrides.neat ?? overrides.neat_calories) ?? undefined,
    },
    overrideDeletes: [],
    measurements: measurements.map((item) => {
      const source = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
      return {
        measuredAt: typeof source.measuredAt === "string" ? source.measuredAt : undefined,
        type: normalizeMeasurementType(typeof source.type === "string" ? source.type : typeof source.name === "string" ? source.name : "measurement"),
        value: normalizeNumber(source.value) ?? 0,
        unit: typeof source.unit === "string" ? source.unit : "unit",
        confidence: normalizeConfidence(source.confidence, normalizeConfidence(record.confidence, 0.6)),
        remarks: normalizeRemarks(source.remarks),
        metadata: source,
      };
    }),
    confidence: normalizeConfidence(record.confidence, 0.6),
    warnings: normalizeWarnings(record.warnings),
    remarks: normalizeRemarks(record.remarks),
    reasoning: normalizeReasoning(record.reasoning),
    adminAlert: normalizeAdminAlert(record.adminAlert),
  };
}

function isValidWatchMessage(msg: string): boolean {
  const m = msg.toLowerCase();
  const watchKeywords = [
    "need", "but", "howev", "add", "trim", "focus", "improv", "rebal", "cut", "reduc",
    "increas", "limit", "avoid", "pair", "supplement", "inclu", "record", "track",
    "low", "high", "surplus", "deficit", "light", "heavy", "excess", "sparse", "less",
    "more", "gap", "short", "miss", "fail", "watch", "adjust"
  ];
  const hasKeyword = watchKeywords.some(kw => m.includes(kw));
  const isPurelyPositive = (m.includes("excellent") || m.includes("perfect") || m.includes("great") || m.includes("solid") || m.includes("on track") || m.includes("good")) &&
                            !m.includes("but") && !m.includes("however") && !m.includes("need") && !m.includes("add") && !m.includes("trim") && !m.includes("reduct") && !m.includes("cut");

  return hasKeyword && !isPurelyPositive;
}

function isValidGoodMessage(msg: string): boolean {
  const m = msg.toLowerCase();
  const positiveKeywords = ["excellent", "perfect", "great", "solid", "on track", "good", "strong", "well", "consistent", "sufficient", "meeting", "satisfy", "adequate", "ideal", "positive"];
  const hasPositive = positiveKeywords.some(kw => m.includes(kw));
  return hasPositive || !isValidWatchMessage(msg);
}

function containsLoggingCaveat(msg: string): boolean {
  const m = msg.toLowerCase();
  const caveatPhrases = [
    "log daily", "track more days", "sparse", "limited data", "more logs",
    "confirm averages", "clearer read", "available logs", "more days",
    "log consistently", "track consistently", "more log", "track more"
  ];
  return caveatPhrases.some(p => m.includes(p));
}

function normalizeDeeperCategoryAnalysis(value: unknown, fallbackStatus: "good" | "watch", fallbackMessage: string, isLoggingCategory = false) {
  const src = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const statusValue = typeof src.status === "string" ? src.status.toLowerCase().trim() : "";
  const status = ["good", "watch"].includes(statusValue) ? (statusValue as "good" | "watch") : fallbackStatus;

  let message = typeof src.message === "string" && src.message.trim().length > 0
    ? src.message.trim()
    : fallbackMessage;

  if (status === "watch" && !isValidWatchMessage(message)) {
    message = fallbackMessage;
  } else if (status === "good" && !isValidGoodMessage(message)) {
    message = fallbackMessage;
  }

  if (!isLoggingCategory && containsLoggingCaveat(message)) {
    message = fallbackMessage;
  }

  const rawExamples = Array.isArray(src.examples) ? src.examples : Array.isArray(src.rootCauses) ? src.rootCauses : [];
  const examples = rawExamples
    .map((item) => {
      const itemSrc = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
      const date = typeof itemSrc.date === "string" ? itemSrc.date.trim() : "";
      const time = typeof itemSrc.time === "string" ? itemSrc.time.trim() : null;

      const parsedSummary = typeof itemSrc.parsedSummary === "string" ? itemSrc.parsedSummary.trim() :
                            typeof itemSrc.parsed_summary === "string" ? itemSrc.parsed_summary.trim() :
                            typeof itemSrc.parsedInfo === "string" ? itemSrc.parsedInfo.trim() :
                            typeof itemSrc.parsed_info === "string" ? itemSrc.parsed_info.trim() : "";

      const reason = typeof itemSrc.reason === "string" ? itemSrc.reason.trim() : "";

      let confidence: number | null = null;
      if (itemSrc.confidence !== undefined && itemSrc.confidence !== null) {
        const parsedConf = Number(itemSrc.confidence);
        if (Number.isFinite(parsedConf)) confidence = parsedConf;
      }

      return { date, time, parsedSummary, reason, confidence };
    })
    .filter((ex) => ex.date.length > 0 && ex.parsedSummary.length > 0);

  return {
    status,
    message,
    examples,
  };
}

export function normalizeAnalysisReportResult(value: unknown) {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};

  const summary = typeof record.summary === "string" ? record.summary.trim() : "";

  const rootCauses = Array.isArray(record.rootCauses)
    ? record.rootCauses.map((item) => typeof item === "string" ? item.trim() : "").filter(Boolean)
    : Array.isArray(record.root_causes)
      ? record.root_causes.map((item) => typeof item === "string" ? item.trim() : "").filter(Boolean)
      : [];

  const focusAreas = (Array.isArray(record.focusAreas) ? record.focusAreas : Array.isArray(record.focus_areas) ? record.focus_areas : [])
    .map((item) => {
      const src = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
      const action = typeof src.action === "string" ? src.action.trim() : "";
      const rationale = typeof src.rationale === "string" ? src.rationale.trim() : "";
      return { action, rationale };
    })
    .filter((item) => item.action.length > 0);

  const profileGaps = (Array.isArray(record.profileGaps) ? record.profileGaps : Array.isArray(record.profile_gaps) ? record.profile_gaps : [])
    .map((item) => {
      const src = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
      const parameter = typeof src.parameter === "string" ? src.parameter.trim() : typeof src.field === "string" ? src.field.trim() : "";
      const whyItMatters = typeof src.whyItMatters === "string" ? src.whyItMatters.trim() : typeof src.why_it_matters === "string" ? src.why_it_matters.trim() : "";
      const improveAdvice = typeof src.improveAdvice === "string" ? src.improveAdvice.trim() : typeof src.improve_advice === "string" ? src.improve_advice.trim() : typeof src.improveWith === "string" ? src.improveWith.trim() : "";
      return { parameter, whyItMatters, improveAdvice };
    })
    .filter((item) => item.parameter.length > 0);

  const confidenceValue = typeof record.confidence === "string" ? record.confidence.toLowerCase().trim() : "low";
  const confidence = ["low", "medium", "high"].includes(confidenceValue)
    ? (confidenceValue as "low" | "medium" | "high")
    : "low";

  const waterAnalysis = normalizeDeeperCategoryAnalysis(
    record.waterAnalysis,
    "watch",
    "Hydration needs a clearer read to assess liquid intake alignment.",
    false,
  );
  const calorieAnalysis = normalizeDeeperCategoryAnalysis(
    record.calorieAnalysis,
    "watch",
    "Calories need a clearer read to assess target alignment.",
    false,
  );
  const proteinAnalysis = normalizeDeeperCategoryAnalysis(
    record.proteinAnalysis,
    "watch",
    "Protein needs a specific read to assess muscle goal alignment.",
    false,
  );
  const macroAnalysis = normalizeDeeperCategoryAnalysis(
    record.macroAnalysis,
    "watch",
    "Energy split needs a target check to assess macro balance.",
    false,
  );

  const loggingHabitAnalysis = normalizeDeeperCategoryAnalysis(
    record.loggingHabitAnalysis,
    "watch",
    "Logging habits need to be evaluated from more logs.",
    true,
  );
  const mealChoiceAnalysis = normalizeDeeperCategoryAnalysis(
    record.mealChoiceAnalysis,
    "watch",
    "Meal choices need a clear log of food-quality patterns.",
    false,
  );
  const exerciseHabitAnalysis = normalizeDeeperCategoryAnalysis(
    record.exerciseHabitAnalysis,
    "watch",
    "Exercise patterns need a target check to assess activity alignment.",
    false,
  );

  return {
    summary,
    rootCauses,
    focusAreas,
    profileGaps,
    confidence,
    waterAnalysis,
    calorieAnalysis,
    proteinAnalysis,
    macroAnalysis,
    loggingHabitAnalysis,
    mealChoiceAnalysis,
    exerciseHabitAnalysis,
  };
}
