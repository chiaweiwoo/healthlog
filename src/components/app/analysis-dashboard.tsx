"use client";

import { useState, useMemo } from "react";
import {
  ComposedChart,
  BarChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  ReferenceLine,
  Cell,
  ResponsiveContainer,
  Customized,
} from "recharts";
import { InfoButton } from "@/components/app/info-button";
import { cn } from "@/lib/utils";

export type DailyHistoryItem = {
  date: string;
  isLogged: boolean;
  calories: number;
  proteinG: number;
  fatG: number;
  carbsG: number;
  alcoholG: number;
  waterMl: number;
  exerciseCalories: number;
  bmr: number;
  baseTdee: number;
  tefCalories: number;
  tdee: number;
  waterTarget: number;
};

const DAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];
const CALORIES_PER_KG = 7700;

function getDayLetter(dateStr: string) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return DAY_LETTERS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

function formatDateShort(dateStr: string) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function getSundayIndices(data: Array<{ date: string }>) {
  return data
    .map((d, i) => {
      const [y, m, day] = d.date.split("-").map(Number);
      return { i, dow: new Date(Date.UTC(y, m - 1, day)).getUTCDay() };
    })
    .filter(({ dow }) => dow === 0)
    .map(({ i }) => i);
}

type AxisItem = {
  ticks: Array<{ coordinate: number }>;
  y: number;
  height: number;
};

function WeekSeparatorLines({
  sundayIndices,
  xAxisMap,
  yAxisMap,
}: {
  sundayIndices: number[];
  xAxisMap?: Record<string | number, AxisItem>;
  yAxisMap?: Record<string | number, AxisItem>;
}) {
  if (!xAxisMap || !yAxisMap || sundayIndices.length === 0) return null;
  const xAxis = Object.values(xAxisMap)[0];
  const yAxis = Object.values(yAxisMap)[0];
  if (!xAxis?.ticks?.length || !yAxis) return null;

  const ticks = xAxis.ticks;
  const y1 = yAxis.y;
  const y2 = yAxis.y + yAxis.height;

  return (
    <g>
      {sundayIndices.map((idx) => {
        if (idx + 1 >= ticks.length) return null;
        const x = (ticks[idx].coordinate + ticks[idx + 1].coordinate) / 2;
        return (
          <line
            key={idx}
            x1={x}
            y1={y1}
            x2={x}
            y2={y2}
            stroke="#78716c"
            strokeWidth={1}
            strokeDasharray="3 3"
            opacity={0.35}
          />
        );
      })}
    </g>
  );
}

function CalorieBalanceChart({ dailyHistory }: { dailyHistory: DailyHistoryItem[] }) {
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);

  const data = useMemo(() => {
    const base = dailyHistory.slice(-14).map((day) => ({
      dayLabel: getDayLetter(day.date),
      date: day.date,
      balance: day.isLogged ? Math.round(day.calories - day.tdee) : null,
      calories: day.calories,
      tdee: Math.round(day.tdee),
      isLogged: day.isLogged,
    }));

    // 7-day rolling average (logged days only, require ≥2 logged in window)
    return base.map((d, i) => {
      const windowSlice = base.slice(Math.max(0, i - 6), i + 1);
      const logged = windowSlice.filter((w) => w.balance !== null);
      const movingAvg =
        logged.length >= 2
          ? Math.round(
              logged.reduce((sum, w) => sum + (w.balance as number), 0) /
                logged.length,
            )
          : null;
      return { ...d, movingAvg };
    });
  }, [dailyHistory]);

  const sundayIndices = useMemo(() => getSundayIndices(data), [data]);

  // Weight trend based on the most recent 7-day moving average
  // Formula: 1 kg body fat ≈ 7700 kcal
  const weightTrend = useMemo(() => {
    const last = [...data].reverse().find((d) => d.movingAvg !== null);
    if (!last || last.movingAvg === null) return null;
    const weeklyKg = (last.movingAvg * 7) / CALORIES_PER_KG;
    return { avgKcal: last.movingAvg, weeklyKg };
  }, [data]);

  const effectiveIdx = selectedIdx ?? data.length - 1;
  const selected = data[effectiveIdx];

  return (
    <div className="rounded-xl border border-stone-200 bg-stone-50/60 px-4 py-3 space-y-3 shadow-xs">
      <div className="flex items-start justify-between gap-2">
        <div>
          <span className="text-[9px] font-bold uppercase tracking-wider text-stone-400">
            14-Day Trend
          </span>
          <h2 className="text-sm font-bold text-stone-900">Calorie Deficit / Surplus</h2>
        </div>
        <InfoButton
          title="How the 7-day trend works"
          className="-mr-1 -mt-1"
          description={
            <>
              <p>
                Each bar is daily intake minus daily TDEE. A negative value is a
                deficit; a positive value is a surplus.
              </p>
              <p>
                The dashed line averages the logged daily balances within that
                date and the previous six calendar days. It appears once at least
                two logged days are available in the window.
              </p>
              <p>
                The weekly weight estimate multiplies the latest daily average by
                seven, then divides by 7,700 kcal per kg. 7,000 kcal is a common
                rounded shortcut, but this app uses 7,700.
              </p>
              <p>
                This is a rough energy-equivalent estimate, not a prediction of
                scale weight. Water, glycogen, digestion, and metabolic adaptation
                can produce different short-term results.
              </p>
            </>
          }
        />
      </div>

      <div className="select-none cursor-pointer">
        <ResponsiveContainer width="100%" height={150}>
          <ComposedChart
            data={data}
            margin={{ top: 8, right: 4, left: -16, bottom: 0 }}
            onClick={(state: unknown) => {
              const idx = (state as { activeTooltipIndex?: number | null })
                ?.activeTooltipIndex;
              if (typeof idx === "number") setSelectedIdx(idx);
            }}
          >
            <XAxis
              dataKey="dayLabel"
              tick={{ fontSize: 10, fill: "#a8a29e" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 9, fill: "#a8a29e" }}
              axisLine={false}
              tickLine={false}
              tickCount={5}
              tickFormatter={(v: number) =>
                v === 0 ? "0" : `${v > 0 ? "+" : ""}${v}`
              }
            />
            <ReferenceLine y={0} stroke="#d6d3d1" strokeWidth={1.5} />
            <Bar dataKey="balance" maxBarSize={18} radius={[2, 2, 2, 2]}>
              {data.map((entry, idx) => (
                <Cell
                  key={idx}
                  fill={
                    entry.balance === null
                      ? "transparent"
                      : entry.balance > 0
                        ? "#ef4444"
                        : entry.balance < 0
                          ? "#10b981"
                          : "#a8a29e"
                  }
                  opacity={selectedIdx !== null && selectedIdx !== idx ? 0.5 : 1}
                />
              ))}
            </Bar>
            <Line
              dataKey="movingAvg"
              type="monotone"
              stroke="#78716c"
              strokeWidth={1.5}
              strokeDasharray="4 2"
              dot={false}
              connectNulls={false}
            />
            <Customized
              component={
                ((props: Record<string, unknown>) => (
                  <WeekSeparatorLines
                    sundayIndices={sundayIndices}
                    xAxisMap={props.xAxisMap as Record<string | number, AxisItem>}
                    yAxisMap={props.yAxisMap as Record<string | number, AxisItem>}
                  />
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
              )) as any
              }
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-white rounded-lg border border-stone-200/60 px-3 py-2 text-center min-h-[52px] flex flex-col justify-center">
        {selected?.isLogged ? (
          <>
            <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400">
              {formatDateShort(selected.date)}
            </p>
            <p
              className={cn(
                "text-[13px] font-semibold mt-0.5",
                (selected.balance ?? 0) > 0
                  ? "text-red-700"
                  : (selected.balance ?? 0) < 0
                    ? "text-emerald-700"
                    : "text-stone-600",
              )}
            >
              {(selected.balance ?? 0) >= 0
                ? `+${selected.balance} kcal surplus`
                : `${selected.balance} kcal deficit`}
            </p>
            <p className="text-[11px] text-stone-500 mt-0.5">
              Intake {selected.calories} kcal · TDEE {selected.tdee} kcal
            </p>
          </>
        ) : (
          <>
            <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400">
              {selected ? formatDateShort(selected.date) : ""}
            </p>
            <p className="text-[12px] text-stone-400 mt-0.5 italic">No data logged</p>
          </>
        )}
      </div>

      {weightTrend && (
        <div className="px-3 py-1.5 rounded-lg bg-stone-100/70 border border-stone-200/50 text-center">
          <p className="text-[11px] text-stone-600">
            <span className="font-semibold">
              {weightTrend.avgKcal >= 0
                ? `+${weightTrend.avgKcal}`
                : `${weightTrend.avgKcal}`}{" "}
              kcal/day (7d avg)
            </span>
            {" · "}
            <span
              className={cn(
                "font-semibold",
                weightTrend.weeklyKg < 0
                  ? "text-emerald-700"
                  : weightTrend.weeklyKg > 0
                    ? "text-red-700"
                    : "text-stone-600",
              )}
            >
              ~{Math.abs(weightTrend.weeklyKg).toFixed(2)} kg/week{" "}
              {weightTrend.weeklyKg < 0 ? "loss" : "gain"}
            </span>
          </p>
        </div>
      )}
    </div>
  );
}

const MACROS = {
  proteinG: {
    label: "Protein",
    shortLabel: "P",
    color: "#818cf8",
    activeClass: "border-indigo-200 bg-indigo-50 text-indigo-700",
  },
  fatG: {
    label: "Fat",
    shortLabel: "F",
    color: "#fbbf24",
    activeClass: "border-amber-200 bg-amber-50 text-amber-700",
  },
  carbsG: {
    label: "Carbs",
    shortLabel: "C",
    color: "#34d399",
    activeClass: "border-emerald-200 bg-emerald-50 text-emerald-700",
  },
} as const;

type MacroKey = keyof typeof MACROS;

function MacroBreakdownChart({ dailyHistory }: { dailyHistory: DailyHistoryItem[] }) {
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [focusedMacro, setFocusedMacro] = useState<MacroKey | null>(null);

  const data = useMemo(
    () =>
      dailyHistory.slice(-14).map((day) => ({
        dayLabel: getDayLetter(day.date),
        date: day.date,
        proteinG: day.isLogged ? Math.round(day.proteinG) : 0,
        fatG: day.isLogged ? Math.round(day.fatG) : 0,
        carbsG: day.isLogged ? Math.round(day.carbsG) : 0,
        isLogged: day.isLogged,
      })),
    [dailyHistory],
  );

  const sundayIndices = useMemo(() => getSundayIndices(data), [data]);

  const effectiveIdx = selectedIdx ?? data.length - 1;
  const selected = data[effectiveIdx];
  const hasMacroData =
    selected &&
    (selected.proteinG > 0 || selected.fatG > 0 || selected.carbsG > 0);

  const handleClick = (state: unknown) => {
    const idx = (state as { activeTooltipIndex?: number | null })?.activeTooltipIndex;
    if (typeof idx === "number") setSelectedIdx(idx);
  };

  return (
    <div className="rounded-xl border border-stone-200 bg-stone-50/60 px-4 py-3 space-y-3 shadow-xs">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <span className="text-[9px] font-bold uppercase tracking-wider text-stone-400">
            14-Day Trend
          </span>
          <h2 className="text-sm font-bold text-stone-900">Macro Intake Breakdown</h2>
        </div>
        <div
          className="flex items-center gap-1 self-end sm:pt-0.5 sm:shrink-0"
          aria-label="Choose a macro to view separately"
        >
          {(Object.entries(MACROS) as [MacroKey, (typeof MACROS)[MacroKey]][]).map(
            ([key, macro]) => {
              const isFocused = focusedMacro === key;
              const isDimmed = focusedMacro !== null && !isFocused;

              return (
                <button
                  key={key}
                  type="button"
                  aria-pressed={isFocused}
                  title={`Show ${macro.label.toLowerCase()} only`}
                  onClick={() => setFocusedMacro(isFocused ? null : key)}
                  className={cn(
                    "inline-flex min-h-7 items-center gap-1 rounded-full border border-transparent px-2 text-[10px] font-medium transition",
                    isFocused
                      ? macro.activeClass
                      : "text-stone-500 hover:border-stone-200 hover:bg-white",
                    isDimmed && "opacity-40",
                  )}
                >
                  <span
                    className="inline-block h-2 w-2 rounded-sm"
                    style={{ backgroundColor: macro.color }}
                  />
                  {macro.label}
                </button>
              );
            },
          )}
        </div>
      </div>

      <div className="select-none cursor-pointer">
        <ResponsiveContainer width="100%" height={150}>
          <BarChart
            data={data}
            margin={{ top: 8, right: 4, left: -16, bottom: 0 }}
            onClick={handleClick}
          >
            <XAxis
              dataKey="dayLabel"
              tick={{ fontSize: 10, fill: "#a8a29e" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 9, fill: "#a8a29e" }}
              axisLine={false}
              tickLine={false}
              tickCount={4}
              tickFormatter={(value: number) => `${value}g`}
            />
            {(Object.entries(MACROS) as [MacroKey, (typeof MACROS)[MacroKey]][])
              .filter(([key]) => focusedMacro === null || focusedMacro === key)
              .map(([key, macro], visibleIndex, visibleMacros) => (
                <Bar
                  key={key}
                  dataKey={key}
                  stackId="macros"
                  fill={macro.color}
                  radius={
                    visibleIndex === visibleMacros.length - 1 ? [2, 2, 0, 0] : 0
                  }
                  maxBarSize={18}
                >
                  {data.map((_, idx) => (
                    <Cell
                      key={idx}
                      opacity={
                        selectedIdx !== null && selectedIdx !== idx ? 0.4 : 1
                      }
                    />
                  ))}
                </Bar>
              ))}
            <Customized
              component={
                ((props: Record<string, unknown>) => (
                  <WeekSeparatorLines
                    sundayIndices={sundayIndices}
                    xAxisMap={props.xAxisMap as Record<string | number, AxisItem>}
                    yAxisMap={props.yAxisMap as Record<string | number, AxisItem>}
                  />
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
              )) as any
              }
            />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-white rounded-lg border border-stone-200/60 px-3 py-2 text-center min-h-[52px] flex flex-col justify-center">
        {selected?.isLogged && hasMacroData ? (
          <>
            <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400">
              {formatDateShort(selected.date)}
            </p>
            <p className="text-[13px] font-semibold text-stone-800 mt-0.5">
              {focusedMacro
                ? `${MACROS[focusedMacro].label} ${selected[focusedMacro]}g`
                : "Daily macro readings"}
            </p>
            <p className="text-[11px] text-stone-500 mt-0.5">
              P {selected.proteinG}g · F {selected.fatG}g · C {selected.carbsG}g
            </p>
          </>
        ) : (
          <>
            <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400">
              {selected ? formatDateShort(selected.date) : ""}
            </p>
            <p className="text-[12px] text-stone-400 mt-0.5 italic">No data logged</p>
          </>
        )}
      </div>
    </div>
  );
}

export function AnalysisDashboard({ dailyHistory = [] }: { dailyHistory?: DailyHistoryItem[] }) {
  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 py-4">
      <h1 className="text-base font-bold text-stone-900">Analysis</h1>
      <CalorieBalanceChart dailyHistory={dailyHistory} />
      <MacroBreakdownChart dailyHistory={dailyHistory} />
    </div>
  );
}
