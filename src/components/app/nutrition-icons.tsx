"use client";

import { Dumbbell, Droplets, Flame, Wheat, Wine } from "lucide-react";

type NutritionData = {
  calories?: number | null;
  proteinG?: number | null;
  fatG?: number | null;
  carbsG?: number | null;
  alcoholG?: number | null;
  waterMl?: number | null;
};

function FatDropIcon({ size = 12 }: { size?: number }) {
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
    >
      <path d="M12 2C12 2 6 9 6 14.5C6 17.985 8.686 21 12 21C15.314 21 18 17.985 18 14.5C18 9 12 2 12 2Z" />
      <path d="M9 14C9.5 12.5 11 11 12.5 11" strokeWidth="1.5" />
    </svg>
  );
}

const MACROS: {
  key: keyof NutritionData;
  icon: (props: { size?: number }) => React.ReactNode;
  color: string;
  unit: string;
}[] = [
  { key: "calories", icon: ({ size = 12 }) => <Flame size={size} />, color: "text-orange-400", unit: "kcal" },
  { key: "proteinG", icon: ({ size = 12 }) => <Dumbbell size={size} />, color: "text-indigo-400", unit: "g" },
  { key: "fatG", icon: FatDropIcon, color: "text-yellow-500", unit: "g" },
  { key: "carbsG", icon: ({ size = 12 }) => <Wheat size={size} />, color: "text-amber-500", unit: "g" },
  { key: "alcoholG", icon: ({ size = 12 }) => <Wine size={size} />, color: "text-purple-400", unit: "g" },
  { key: "waterMl", icon: ({ size = 12 }) => <Droplets size={size} />, color: "text-sky-400", unit: "ml" },
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
