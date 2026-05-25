import { ParsedDailyItem, Profile, Warning, activityLevelSchema } from "@/lib/schemas";
import { round } from "@/lib/utils";

const baselineLifestyleMultipliers: Record<ReturnType<typeof activityLevelSchema.parse>, number> = {
  sedentary: 1.05,
  light: 1.1,
  moderate: 1.16,
  active: 1.25,
  very_active: 1.35,
};

export const atwaterFactors = {
  protein: 4,
  carbs: 4,
  fat: 9,
  alcohol: 7,
} as const;

export const thermicEffectRates = {
  protein: 0.25,
  carbs: 0.08,
  fat: 0.03,
  alcohol: 0.15,
} as const;

export type SummaryDisplayItem = ParsedDailyItem & {
  sourceCreatedAt?: string;
  sourceEntryId?: string;
  sourceOccurredTime?: string | null;
  sourceRawNote?: string;
};

type DerivedNutrition = {
  alcoholG: number | null;
  calories: number | null;
  caloriesIncomplete: boolean;
  caloriesSource: "atwater" | "model" | "none";
  carbsG: number | null;
  fatG: number | null;
  hasAnyBreakdown: boolean;
  macrosIncomplete: boolean;
  proteinG: number | null;
};

type NutritionSource = {
  nutrition?: ParsedDailyItem["nutrition"];
};

type FoodDisplaySource = NutritionSource & {
  kind: ParsedDailyItem["kind"];
};

function isKnownNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

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

export function calculateTdee(profile: Profile, input?: { exerciseCalories?: number; tefCalories?: number }) {
  const exerciseCalories = input?.exerciseCalories ?? 0;
  const tefCalories = input?.tefCalories ?? 0;
  const { bmr, warnings } = calculateBmr(profile);
  if (!bmr || !profile.activityLevel) {
    return {
      bmr,
      baseTdee: null,
      baselineActivityCalories: null,
      tdee: null,
      warnings: [
        ...warnings,
        ...(profile.activityLevel
          ? []
          : [{
              code: "activity_missing",
              message: "Baseline lifestyle is needed for TDEE.",
              improveWith: "Set your baseline lifestyle on the body page.",
            } satisfies Warning]),
      ],
    };
  }

  const baseTdee = round(bmr * baselineLifestyleMultipliers[profile.activityLevel]);
  const baselineActivityCalories = round(Math.max(baseTdee - bmr, 0));
  return {
    bmr,
    baseTdee,
    baselineActivityCalories,
    tdee: round(baseTdee + tefCalories + exerciseCalories),
    warnings,
  };
}

export function deriveFoodNutrition(item: NutritionSource): DerivedNutrition {
  const nutrition = item.nutrition;
  const proteinG = isKnownNumber(nutrition?.proteinG) ? nutrition.proteinG : null;
  const fatG = isKnownNumber(nutrition?.fatG) ? nutrition.fatG : null;
  const carbsG = isKnownNumber(nutrition?.carbsG) ? nutrition.carbsG : null;
  const alcoholG = isKnownNumber(nutrition?.alcoholG) ? nutrition.alcoholG : null;
  const modelCalories = isKnownNumber(nutrition?.calories) ? nutrition.calories : null;

  const hasAnyBreakdown = [proteinG, fatG, carbsG, alcoholG].some(isKnownNumber);
  if (hasAnyBreakdown) {
    const calories =
      (proteinG ?? 0) * atwaterFactors.protein +
      (fatG ?? 0) * atwaterFactors.fat +
      (carbsG ?? 0) * atwaterFactors.carbs +
      (alcoholG ?? 0) * atwaterFactors.alcohol;

    return {
      calories: round(calories),
      caloriesIncomplete: ![proteinG, fatG, carbsG].every(isKnownNumber),
      caloriesSource: "atwater",
      proteinG,
      fatG,
      carbsG,
      alcoholG,
      macrosIncomplete: ![proteinG, fatG, carbsG].every(isKnownNumber),
      hasAnyBreakdown,
    };
  }

  if (modelCalories !== null) {
    return {
      calories: round(modelCalories),
      caloriesIncomplete: false,
      caloriesSource: "model",
      proteinG,
      fatG,
      carbsG,
      alcoholG,
      macrosIncomplete: true,
      hasAnyBreakdown: false,
    };
  }

  return {
    calories: null,
    caloriesIncomplete: true,
    caloriesSource: "none",
    proteinG,
    fatG,
    carbsG,
    alcoholG,
    macrosIncomplete: true,
    hasAnyBreakdown: false,
  };
}

export function getDisplayNutrition(item: FoodDisplaySource) {
  if (item.kind !== "food") {
    return {
      calories: null,
      caloriesIncomplete: false,
      caloriesSource: "none" as const,
      proteinG: null,
      fatG: null,
      carbsG: null,
      alcoholG: null,
      macrosIncomplete: false,
      hasAnyBreakdown: false,
    };
  }
  return deriveFoodNutrition(item);
}

export function calculateThermicEffectOfFood(input: {
  proteinG?: number | null;
  fatG?: number | null;
  carbsG?: number | null;
  alcoholG?: number | null;
}) {
  const proteinCalories = (input.proteinG ?? 0) * atwaterFactors.protein;
  const fatCalories = (input.fatG ?? 0) * atwaterFactors.fat;
  const carbsCalories = (input.carbsG ?? 0) * atwaterFactors.carbs;
  const alcoholCalories = (input.alcoholG ?? 0) * atwaterFactors.alcohol;

  return round(
    proteinCalories * thermicEffectRates.protein +
      fatCalories * thermicEffectRates.fat +
      carbsCalories * thermicEffectRates.carbs +
      alcoholCalories * thermicEffectRates.alcohol,
  );
}

export function getOutputBreakdown(input: {
  bmr: number | null;
  baseTdee: number | null;
  exerciseCalories: number;
  proteinG: number;
  fatG: number;
  carbsG: number;
  alcoholG: number;
}) {
  const tefCalories = calculateThermicEffectOfFood({
    proteinG: input.proteinG,
    fatG: input.fatG,
    carbsG: input.carbsG,
    alcoholG: input.alcoholG,
  });

  if (input.bmr === null || input.baseTdee === null) {
    return {
      bmr: input.bmr,
      baselineActivityCalories: null,
      tefCalories,
      exerciseCalories: input.exerciseCalories,
      totalTdee: null,
    };
  }

  return {
    bmr: input.bmr,
    baselineActivityCalories: round(Math.max(input.baseTdee - input.bmr, 0)),
    tefCalories,
    exerciseCalories: input.exerciseCalories,
    totalTdee: round(input.baseTdee + tefCalories + input.exerciseCalories),
  };
}

export function summarizeDailyItems(items: SummaryDisplayItem[], profile: Profile) {
  const totals = items.reduce(
    (acc, item) => {
      const derived = getDisplayNutrition(item);
      const calories = item.kind === "food" && isKnownNumber(derived.calories) ? derived.calories : 0;
      const proteinG = item.kind === "food" && isKnownNumber(derived.proteinG) ? derived.proteinG : 0;
      const fatG = item.kind === "food" && isKnownNumber(derived.fatG) ? derived.fatG : 0;
      const carbsG = item.kind === "food" && isKnownNumber(derived.carbsG) ? derived.carbsG : 0;
      const alcoholG = item.kind === "food" && isKnownNumber(derived.alcoholG) ? derived.alcoholG : 0;

      acc.calories += calories;
      acc.proteinG += proteinG;
      acc.fatG += fatG;
      acc.carbsG += carbsG;
      acc.alcoholG += alcoholG;
      acc.waterMl += item.waterMl ?? 0;
      acc.exerciseCalories += item.exerciseCalories ?? 0;
      acc.confidenceValues.push(item.confidence);
      acc.warnings.push(...item.warnings);

      if (item.kind === "food") {
        acc.foodItemCount += 1;
        if (derived.caloriesIncomplete) acc.unknownCaloriesCount += 1;
        if (derived.macrosIncomplete) acc.unknownMacroCount += 1;
      }

      return acc;
    },
    {
      calories: 0,
      proteinG: 0,
      fatG: 0,
      carbsG: 0,
      alcoholG: 0,
      waterMl: 0,
      exerciseCalories: 0,
      confidenceValues: [] as number[],
      warnings: [] as Warning[],
      foodItemCount: 0,
      unknownCaloriesCount: 0,
      unknownMacroCount: 0,
    },
  );

  const tefCalories = calculateThermicEffectOfFood({
    proteinG: totals.proteinG,
    fatG: totals.fatG,
    carbsG: totals.carbsG,
    alcoholG: totals.alcoholG,
  });
  const tdee = calculateTdee(profile, { exerciseCalories: totals.exerciseCalories, tefCalories });
  const confidence = totals.confidenceValues.length
    ? round(totals.confidenceValues.reduce((sum, value) => sum + value, 0) / totals.confidenceValues.length, 2)
    : 1;

  const warnings = [...totals.warnings, ...tdee.warnings];
  if (totals.unknownCaloriesCount > 0) {
    warnings.push({
      code: "calories_incomplete",
      message: `${totals.unknownCaloriesCount} food item${totals.unknownCaloriesCount === 1 ? "" : "s"} still need fuller calorie estimates.`,
      improveWith: "Add portion size, brand, or preparation details to improve the estimate.",
    });
  }
  if (totals.unknownMacroCount > 0) {
    warnings.push({
      code: "macros_incomplete",
      message: `${totals.unknownMacroCount} food item${totals.unknownMacroCount === 1 ? "" : "s"} still have incomplete breakdown details.`,
      improveWith: "Add product nutrition or portion details for fuller protein, fat, and carb estimates.",
    });
  }

  const caloriesIncomplete = totals.foodItemCount > 0 && totals.unknownCaloriesCount > 0;
  const macrosIncomplete = totals.foodItemCount > 0 && totals.unknownMacroCount > 0;

  return {
    calories: round(totals.calories),
    proteinG: round(totals.proteinG, 1),
    fatG: round(totals.fatG, 1),
    carbsG: round(totals.carbsG, 1),
    alcoholG: round(totals.alcoholG, 1),
    waterMl: round(totals.waterMl),
    exerciseCalories: round(totals.exerciseCalories),
    bmr: tdee.bmr,
    baseTdee: tdee.baseTdee,
    baselineActivityCalories: tdee.baselineActivityCalories,
    tefCalories,
    tdee: tdee.tdee,
    estimatedDeficit: tdee.tdee === null || caloriesIncomplete ? null : round(tdee.tdee - totals.calories),
    confidence,
    warnings,
    breakdown: {
      food: items.filter((item) => item.kind === "food"),
      water: items.filter((item) => item.kind === "water" || isKnownNumber(item.waterMl)),
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
