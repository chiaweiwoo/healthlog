import { ParsedDailyItem, Profile, Warning, activityLevelSchema } from "@/lib/schemas";
import { round } from "@/lib/utils";

const activityMultipliers: Record<ReturnType<typeof activityLevelSchema.parse>, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

export function calculateBmr(profile: Profile): { bmr: number | null; warnings: Warning[] } {
  const warnings: Warning[] = [];
  if (!profile.age || !profile.sex || !profile.heightCm || !profile.weightKg) {
    warnings.push({
      code: "profile_incomplete",
      message: "Age, sex, height, and weight are needed for a precise BMR estimate.",
      improveWith: "Add age, sex, height, and weight on the body page.",
    });
    return { bmr: null, warnings };
  }

  const base = 10 * profile.weightKg + 6.25 * profile.heightCm - 5 * profile.age;
  const adjustment = profile.sex === "male" ? 5 : -161;
  return { bmr: round(base + adjustment), warnings };
}

export function calculateTdee(profile: Profile, exerciseCalories = 0) {
  const { bmr, warnings } = calculateBmr(profile);
  if (!bmr || !profile.activityLevel) {
    return {
      bmr,
      baseTdee: null,
      tdee: null,
      warnings: [
        ...warnings,
        ...(profile.activityLevel
          ? []
          : [{
              code: "activity_missing",
              message: "Activity level is needed for TDEE.",
              improveWith: "Set an activity level on the body page.",
            } satisfies Warning]),
      ],
    };
  }

  const baseTdee = round(bmr * activityMultipliers[profile.activityLevel]);
  return {
    bmr,
    baseTdee,
    tdee: round(baseTdee + exerciseCalories),
    warnings,
  };
}

export function summarizeDailyItems(items: ParsedDailyItem[], profile: Profile) {
  const totals = items.reduce(
    (acc, item) => {
      acc.calories += item.nutrition?.calories ?? 0;
      acc.proteinG += item.nutrition?.proteinG ?? 0;
      acc.fatG += item.nutrition?.fatG ?? 0;
      acc.carbsG += item.nutrition?.carbsG ?? 0;
      acc.waterMl += item.waterMl ?? 0;
      acc.exerciseCalories += item.exerciseCalories ?? 0;
      acc.confidenceValues.push(item.confidence);
      acc.warnings.push(...item.warnings);
      return acc;
    },
    {
      calories: 0,
      proteinG: 0,
      fatG: 0,
      carbsG: 0,
      waterMl: 0,
      exerciseCalories: 0,
      confidenceValues: [] as number[],
      warnings: [] as Warning[],
    },
  );

  const tdee = calculateTdee(profile, totals.exerciseCalories);
  const confidence = totals.confidenceValues.length
    ? round(totals.confidenceValues.reduce((sum, value) => sum + value, 0) / totals.confidenceValues.length, 2)
    : 1;

  return {
    calories: round(totals.calories),
    proteinG: round(totals.proteinG, 1),
    fatG: round(totals.fatG, 1),
    carbsG: round(totals.carbsG, 1),
    waterMl: round(totals.waterMl),
    exerciseCalories: round(totals.exerciseCalories),
    bmr: tdee.bmr,
    baseTdee: tdee.baseTdee,
    tdee: tdee.tdee,
    estimatedDeficit: tdee.tdee === null ? null : round(tdee.tdee - totals.calories),
    confidence,
    warnings: [...totals.warnings, ...tdee.warnings],
    breakdown: {
      food: items.filter((item) => item.kind === "food"),
      water: items.filter((item) => item.kind === "water"),
      exercise: items.filter((item) => item.kind === "exercise"),
      notes: items.filter((item) => item.kind === "note"),
    },
  };
}
