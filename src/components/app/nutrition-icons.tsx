"use client";

import { Droplets, Egg, Wine, Zap } from "lucide-react";

export type NutritionData = {
  calories?: number | null;
  proteinG?: number | null;
  fatG?: number | null;
  carbsG?: number | null;
  alcoholG?: number | null;
  waterMl?: number | null;
};

export function AvocadoIcon({ size = 12, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M12 2C8.5 2 6 7 6 13a6 6 0 0 0 12 0c0-6-2.5-11-6-11z" />
      <circle cx="12" cy="14" r="2.5" fill="currentColor" />
    </svg>
  );
}

export function BreadIcon({ size = 12, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M7 21h10a2 2 0 0 0 2-2v-6a4 4 0 0 0-3-3.87 4 4 0 0 0-8 0A4 4 0 0 0 5 13v6a2 2 0 0 0 2 2z" />
      <path d="M9 12l2-2" />
      <path d="M13 10l2-2" />
    </svg>
  );
}

export interface NutrientMetadata {
  key: keyof NutritionData;
  label: string;
  unit: string;
  color: string;
  bg: string;
  icon: (props: { size?: number; className?: string }) => React.ReactNode;
}

export const NUTRITION_CONFIG: Record<keyof NutritionData, NutrientMetadata> = {
  calories: {
    key: "calories",
    label: "Calories",
    unit: "kcal",
    color: "text-amber-500",
    bg: "bg-amber-50/60",
    icon: ({ size = 12, className }) => <Zap size={size} className={className} />,
  },
  proteinG: {
    key: "proteinG",
    label: "Protein",
    unit: "g",
    color: "text-indigo-400",
    bg: "bg-indigo-50/60",
    icon: ({ size = 12, className }) => <Egg size={size} className={className} />,
  },
  fatG: {
    key: "fatG",
    label: "Fat",
    unit: "g",
    color: "text-emerald-500",
    bg: "bg-emerald-50/60",
    icon: AvocadoIcon,
  },
  carbsG: {
    key: "carbsG",
    label: "Carbs",
    unit: "g",
    color: "text-orange-400",
    bg: "bg-orange-50/60",
    icon: BreadIcon,
  },
  alcoholG: {
    key: "alcoholG",
    label: "Alcohol",
    unit: "g",
    color: "text-purple-400",
    bg: "bg-purple-50/60",
    icon: ({ size = 12, className }) => <Wine size={size} className={className} />,
  },
  waterMl: {
    key: "waterMl",
    label: "Water",
    unit: "ml",
    color: "text-sky-400",
    bg: "bg-sky-50/60",
    icon: ({ size = 12, className }) => <Droplets size={size} className={className} />,
  },
};

const MACROS = [
  NUTRITION_CONFIG.calories,
  NUTRITION_CONFIG.proteinG,
  NUTRITION_CONFIG.fatG,
  NUTRITION_CONFIG.carbsG,
  NUTRITION_CONFIG.alcoholG,
  NUTRITION_CONFIG.waterMl,
];

export function NutritionIcons({
  data,
  className,
}: {
  data: NutritionData;
  className?: string;
}) {
  const visible = MACROS.filter(({ key }) => {
    const v = data[key];
    return v != null && v !== 0;
  });

  if (!visible.length) {
    return <span className="text-xs text-stone-400">Estimate unavailable</span>;
  }

  return (
    <div className={`flex flex-wrap gap-x-2.5 gap-y-1 ${className ?? ""}`}>
      {visible.map(({ key, icon: Icon, color, unit }) => {
        const v = data[key] as number;
        return (
          <span key={key} className="inline-flex items-center gap-1">
            <span className={color}>
              <Icon size={11} />
            </span>
            <span className="text-xs font-medium text-stone-500">
              {v}
              {unit}
            </span>
          </span>
        );
      })}
    </div>
  );
}
