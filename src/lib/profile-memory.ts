import { Profile, ProfileMemoryItem, ProfileOverrideKey, ProfileOverrides, activityLevelSchema } from "@/lib/schemas";
import { round } from "@/lib/utils";

type ActivityLevel = ReturnType<typeof activityLevelSchema.parse>;

export const baselineLifestyleMultipliers: Record<ActivityLevel, number> = {
  sedentary: 1.05,
  light: 1.1,
  moderate: 1.16,
  active: 1.25,
  very_active: 1.35,
};

export type DailyDependencyStatus = "ready" | "missing" | "estimated" | "overridden";

type ProfileMetadataShape = {
  overrides?: ProfileOverrides;
  memory?: ProfileMemoryItem[];
};

type DerivedValue = {
  status: DailyDependencyStatus;
  value: number | null;
  reason: string;
};

function asRecord(value: unknown) {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function parseMemoryItem(value: unknown): ProfileMemoryItem | null {
  const record = asRecord(value);
  if (!record.id || !record.label || !record.value || !record.category || !record.updatedAt) return null;
  if (typeof record.id !== "string" || typeof record.label !== "string" || typeof record.value !== "string") return null;
  if (typeof record.updatedAt !== "string") return null;
  if (
    !["lifestyle", "diet", "exercise_context", "food_context", "medical_context", "preference", "other"].includes(
      String(record.category),
    )
  ) {
    return null;
  }

  return {
    id: record.id,
    category: record.category as ProfileMemoryItem["category"],
    label: record.label,
    value: record.value,
    sourceNoteId: typeof record.sourceNoteId === "string" ? record.sourceNoteId : undefined,
    updatedAt: record.updatedAt,
  };
}

export function getProfileMetadata(profile: Profile | null | undefined): ProfileMetadataShape {
  const record = asRecord(profile?.metadata);
  const overridesRecord = asRecord(record.overrides);
  const memory = Array.isArray(record.memory) ? record.memory.map(parseMemoryItem).filter(Boolean) as ProfileMemoryItem[] : [];

  return {
    overrides: {
      waterTargetMl: typeof overridesRecord.waterTargetMl === "number" ? overridesRecord.waterTargetMl : undefined,
      bmr: typeof overridesRecord.bmr === "number" ? overridesRecord.bmr : undefined,
      neatCalories: typeof overridesRecord.neatCalories === "number" ? overridesRecord.neatCalories : undefined,
    },
    memory,
  };
}

export function getProfileOverrides(profile: Profile | null | undefined): ProfileOverrides {
  return getProfileMetadata(profile).overrides ?? {};
}

export function getProfileMemory(profile: Profile | null | undefined): ProfileMemoryItem[] {
  return getProfileMetadata(profile).memory ?? [];
}

export function calculateProfileBmr(profile: Profile) {
  if (!profile.age || !profile.sex || !profile.heightCm || !profile.weightKg) return null;
  const base = 10 * profile.weightKg + 6.25 * profile.heightCm - 5 * profile.age;
  const adjustment = profile.sex === "male" ? 5 : -161;
  return round(base + adjustment);
}

export function deriveWaterTarget(profile: Profile | null | undefined): DerivedValue {
  const overrides = getProfileOverrides(profile);
  if (overrides.waterTargetMl != null) {
    return {
      status: "overridden",
      value: round(overrides.waterTargetMl),
      reason: "Using your profile override for daily water target.",
    };
  }
  if (profile?.weightKg) {
    return {
      status: "estimated",
      value: round(profile.weightKg * 35),
      reason: "Estimated from 35 ml per kg of body weight.",
    };
  }
  if (profile?.sex === "male" || profile?.sex === "female") {
    return {
      status: "estimated",
      value: profile.sex === "male" ? 3000 : 2200,
      reason: "Using a sex-based fallback until weight is available.",
    };
  }
  return {
    status: "missing",
    value: null,
    reason: "Need weight because water target is estimated from ml/kg.",
  };
}

export function deriveBmr(profile: Profile | null | undefined): DerivedValue {
  const overrides = getProfileOverrides(profile);
  if (overrides.bmr != null) {
    return {
      status: "overridden",
      value: round(overrides.bmr),
      reason: "Using your profile override for BMR.",
    };
  }
  if (!profile) {
    return {
      status: "missing",
      value: null,
      reason: "Need age, sex, height, and weight because BMR uses Mifflin-St Jeor.",
    };
  }
  const bmr = calculateProfileBmr(profile);
  if (bmr == null) {
    return {
      status: "missing",
      value: null,
      reason: "Need age, sex, height, and weight because BMR uses Mifflin-St Jeor.",
    };
  }
  return {
    status: "estimated",
    value: bmr,
    reason: "Estimated from age, sex, height, and weight with Mifflin-St Jeor.",
  };
}

export function deriveNeat(profile: Profile | null | undefined): DerivedValue {
  const overrides = getProfileOverrides(profile);
  if (overrides.neatCalories != null) {
    return {
      status: "overridden",
      value: round(overrides.neatCalories),
      reason: "Using your profile override for NEAT.",
    };
  }
  if (!profile?.activityLevel) {
    return {
      status: "missing",
      value: null,
      reason: "Need baseline lifestyle because NEAT estimates non-exercise movement.",
    };
  }

  const bmr = deriveBmr(profile).value;
  if (bmr == null) {
    return {
      status: "missing",
      value: null,
      reason: "Need age, sex, height, and weight because NEAT depends on BMR too.",
    };
  }

  const baseTdee = round(bmr * baselineLifestyleMultipliers[profile.activityLevel]);
  return {
    status: "estimated",
    value: round(Math.max(baseTdee - bmr, 0)),
    reason: "Estimated from your baseline lifestyle and BMR, excluding logged exercise.",
  };
}

export function buildProfileMetadata(input: {
  existing: unknown;
  overrides?: Partial<ProfileOverrides>;
  overrideDeletes?: ProfileOverrideKey[];
  memoryUpserts?: ProfileMemoryItem[];
  memoryDeletes?: string[];
}) {
  const existingMetadata = asRecord(input.existing);
  const current = getProfileMetadata({ country: "Singapore", metadata: existingMetadata });
  const nextOverrides: ProfileOverrides = { ...(current.overrides ?? {}) };
  for (const key of input.overrideDeletes ?? []) {
    delete nextOverrides[key];
  }
  for (const [key, value] of Object.entries(input.overrides ?? {})) {
    if (typeof value === "number" && Number.isFinite(value)) {
      nextOverrides[key as keyof ProfileOverrides] = value;
    }
  }

  const deleteIds = new Set(input.memoryDeletes ?? []);
  const memoryMap = new Map<string, ProfileMemoryItem>(
    (current.memory ?? []).filter((item) => !deleteIds.has(item.id)).map((item) => [item.id, item]),
  );
  for (const item of input.memoryUpserts ?? []) {
    memoryMap.set(item.id, item);
  }

  return {
    ...existingMetadata,
    overrides: nextOverrides,
    memory: Array.from(memoryMap.values()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
  };
}

export function formatStatusLabel(status: DailyDependencyStatus) {
  if (status === "overridden") return "Overridden";
  if (status === "estimated") return "Estimated";
  if (status === "ready") return "Ready";
  return "Missing";
}
