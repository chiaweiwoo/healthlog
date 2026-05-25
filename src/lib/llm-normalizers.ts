import { parseISO } from "date-fns";

function normalizeOccurredTime(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const trimmed = value.trim();
  const hhmm = trimmed.match(/^(\d{2}):(\d{2})/);
  if (hhmm) return `${hhmm[1]}:${hhmm[2]}`;
  const maybeDate = Date.parse(trimmed);
  if (!Number.isNaN(maybeDate)) {
    const parsed = parseISO(trimmed);
    return `${String(parsed.getUTCHours()).padStart(2, "0")}:${String(parsed.getUTCMinutes()).padStart(2, "0")}`;
  }
  return undefined;
}

function normalizeActionType(value: unknown) {
  if (typeof value !== "string") return "create";
  const normalized = value.toLowerCase().trim();
  if (["create", "edit", "delete", "clarify"].includes(normalized)) return normalized;
  if (["eat", "drink", "exercise", "log", "record", "add"].includes(normalized)) return "create";
  if (["remove", "removed"].includes(normalized)) return "delete";
  if (["update", "updated", "change", "changed"].includes(normalized)) return "edit";
  return "create";
}

function normalizeWarnings(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((warning) => {
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
    .filter(Boolean);
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

  return {
    occurredTime: normalizeOccurredTime(record.occurredTime),
    actionType: normalizeActionType(record.actionType),
    items: rawItems.map((item, index) => {
      const source = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
      const nutritionSource = getNutritionSource(source);
      const kindInput = typeof source.kind === "string" ? source.kind.toLowerCase() : typeof source.type === "string" ? source.type.toLowerCase() : "note";
      const kind = kindInput === "meal" ? "food" : kindInput === "drink" ? "water" : kindInput;
      return {
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
    }),
    confidence: normalizeConfidence(record.confidence, 0.6),
    warnings: normalizeWarnings(record.warnings),
    remarks: normalizeRemarks(record.remarks),
  };
}

export function normalizeBodyResult(raw: unknown) {
  const record = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const profile = record.profile && typeof record.profile === "object" ? (record.profile as Record<string, unknown>) : undefined;
  const measurements = Array.isArray(record.measurements) ? record.measurements : [];
  const metadataUpserts = Array.isArray(record.metadataUpserts)
    ? record.metadataUpserts
    : Array.isArray(record.memory)
      ? record.memory
      : [];
  const metadataDeletes = Array.isArray(record.metadataDeletes)
    ? record.metadataDeletes
    : Array.isArray(record.deleteMemory)
      ? record.deleteMemory
      : [];
  const overrides =
    record.overrides && typeof record.overrides === "object"
      ? (record.overrides as Record<string, unknown>)
      : record.profileOverrides && typeof record.profileOverrides === "object"
        ? (record.profileOverrides as Record<string, unknown>)
        : {};

  return {
    action: normalizeProfileAction(record.action ?? record.actionType),
    profile: profile
      ? {
          age: normalizeNumber(profile.age),
          sex:
            profile.sex === "male" || profile.sex === "female"
              ? profile.sex
              : profile.gender === "male" || profile.gender === "female"
                ? profile.gender
                : null,
          heightCm: normalizeNumber(profile.heightCm ?? profile.height),
          weightKg: normalizeNumber(profile.weightKg ?? profile.weight),
          activityLevel:
            typeof profile.activityLevel === "string"
              ? (
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
                )[profile.activityLevel.toLowerCase().replace(/\s+/g, "_") as keyof {
                  sedentary: "sedentary";
                  low: "light";
                  light: "light";
                  moderate: "moderate";
                  active: "active";
                  very_active: "very_active";
                  veryactive: "very_active";
                  high: "very_active";
                }] ?? null
              : null,
          goal: typeof profile.goal === "string" ? profile.goal : null,
          country: typeof profile.country === "string" ? profile.country : "Singapore",
          remarks: normalizeRemarks(profile.remarks),
          metadata: profile,
        }
      : undefined,
    metadataUpserts: metadataUpserts
      .map((item, index) => {
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
        return {
          id: typeof source.id === "string" ? source.id : `memory-${index + 1}`,
          category: normalizeMemoryCategory(source.category),
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
    metadataDeletes: metadataDeletes.filter((item): item is string => typeof item === "string" && item.trim().length > 0),
    overrides: {
      waterTargetMl: normalizeNumber(
        overrides.waterTargetMl ?? overrides.water_target_ml ?? overrides.waterTarget ?? overrides.water_ml,
      ) ?? undefined,
      bmr: normalizeNumber(overrides.bmr ?? overrides.basalMetabolicRate) ?? undefined,
      neatCalories: normalizeNumber(overrides.neatCalories ?? overrides.neat ?? overrides.neat_calories) ?? undefined,
    },
    overrideDeletes: Array.isArray(record.overrideDeletes)
      ? record.overrideDeletes.filter(
          (item): item is "waterTargetMl" | "bmr" | "neatCalories" =>
            item === "waterTargetMl" || item === "bmr" || item === "neatCalories",
        )
      : [],
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
  };
}
