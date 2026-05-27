"use client";

import { Droplets, Egg, Wine, Zap } from "lucide-react";

type NutritionData = {
  calories?: number | null;
  proteinG?: number | null;
  fatG?: number | null;
  carbsG?: number | null;
  alcoholG?: number | null;
  waterMl?: number | null;
};

export function AvocadoIcon({ size = 12 }: { size?: number }) {
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
      <path d="M12 2C8.5 2 6 7 6 13a6 6 0 0 0 12 0c0-6-2.5-11-6-11z" />
      <circle cx="12" cy="14" r="2.5" fill="currentColor" />
    </svg>
  );
}

export function BreadIcon({ size = 12 }: { size?: number }) {
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
      <path d="M7 21h10a2 2 0 0 0 2-2v-6a4 4 0 0 0-3-3.87 4 4 0 0 0-8 0A4 4 0 0 0 5 13v6a2 2 0 0 0 2 2z" />
      <path d="M9 12l2-2" />
      <path d="M13 10l2-2" />
    </svg>
  );
}

const MACROS: {
  key: keyof NutritionData;
  icon: (props: { size?: number }) => React.ReactNode;
  color: string;
  unit: string;
}[] = [
  { key: "calories", icon: ({ size = 12 }) => <Zap size={size} />, color: "text-amber-500", unit: "kcal" },
  { key: "proteinG", icon: ({ size = 12 }) => <Egg size={size} />, color: "text-indigo-400", unit: "g" },
  { key: "fatG", icon: AvocadoIcon, color: "text-emerald-500", unit: "g" },
  { key: "carbsG", icon: BreadIcon, color: "text-orange-400", unit: "g" },
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
