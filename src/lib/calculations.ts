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

function hasKnownNutritionValue(item: ParsedDailyItem, key: "calories" | "proteinG" | "fatG" | "carbsG") {
  return item.kind === "food" && item.nutrition && typeof item.nutrition[key] === "number";
}

export function summarizeDailyItems(items: ParsedDailyItem[], profile: Profile) {
  const totals = items.reduce(
    (acc, item) => {
      const calories = hasKnownNutritionValue(item, "calories") ? item.nutrition?.calories ?? 0 : 0;
      const proteinG = hasKnownNutritionValue(item, "proteinG") ? item.nutrition?.proteinG ?? 0 : 0;
      const fatG = hasKnownNutritionValue(item, "fatG") ? item.nutrition?.fatG ?? 0 : 0;
      const carbsG = hasKnownNutritionValue(item, "carbsG") ? item.nutrition?.carbsG ?? 0 : 0;

      acc.calories += calories;
      acc.proteinG += proteinG;
      acc.fatG += fatG;
      acc.carbsG += carbsG;
      acc.waterMl += item.waterMl ?? 0;
      acc.exerciseCalories += item.exerciseCalories ?? 0;
      acc.confidenceValues.push(item.confidence);
      acc.warnings.push(...item.warnings);

      if (item.kind === "food") {
        acc.foodItemCount += 1;
        if (!hasKnownNutritionValue(item, "calories")) acc.unknownCaloriesCount += 1;
        if (!hasKnownNutritionValue(item, "proteinG") || !hasKnownNutritionValue(item, "fatG") || !hasKnownNutritionValue(item, "carbsG")) {
          acc.unknownMacroCount += 1;
        }
      }

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
      foodItemCount: 0,
      unknownCaloriesCount: 0,
      unknownMacroCount: 0,
    },
  );

  const tdee = calculateTdee(profile, totals.exerciseCalories);
  const confidence = totals.confidenceValues.length
    ? round(totals.confidenceValues.reduce((sum, value) => sum + value, 0) / totals.confidenceValues.length, 2)
    : 1;

  const warnings = [...totals.warnings, ...tdee.warnings];
  if (totals.unknownCaloriesCount > 0) {
    warnings.push({
      code: "calories_incomplete",
      message: `${totals.unknownCaloriesCount} food item${totals.unknownCaloriesCount === 1 ? "" : "s"} still need calorie estimates.`,
      improveWith: "Add portion size, brand, or preparation details to improve the estimate.",
    });
  }
  if (totals.unknownMacroCount > 0) {
    warnings.push({
      code: "macros_incomplete",
      message: `${totals.unknownMacroCount} food item${totals.unknownMacroCount === 1 ? "" : "s"} still have incomplete macros.`,
      improveWith: "Add portion size or product nutrition details for fuller macro estimates.",
    });
  }

  const caloriesIncomplete = totals.foodItemCount > 0 && totals.unknownCaloriesCount > 0;
  const macrosIncomplete = totals.foodItemCount > 0 && totals.unknownMacroCount > 0;

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
    estimatedDeficit: tdee.tdee === null || caloriesIncomplete ? null : round(tdee.tdee - totals.calories),
    confidence,
    warnings,
    breakdown: {
      food: items.filter((item) => item.kind === "food"),
      water: items.filter((item) => item.kind === "water"),
      exercise: items.filter((item) => item.kind === "exercise"),
      notes: items.filter((item) => item.kind === "note"),
      meta: {
        foodItemCount: totals.foodItemCount,
        unknownCaloriesCount: totals.unknownCaloriesCount,
        unknownMacroCount: totals.unknownMacroCount,
        caloriesIncomplete,
        macrosIncomplete,
      },
    },
  };
}
