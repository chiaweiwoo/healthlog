"use client";

import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type RecordDatesResponse = {
  dates?: string[];
};

function parseDateOnly(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
}

export function DatePickerDialog({
  value,
  onChange,
  refreshKey = 0,
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  refreshKey?: number;
  disabled?: boolean;
}) {
  const selectedDate = useMemo(() => parseDateOnly(value), [value]);
  const [open, setOpen] = useState(false);
  const [visibleMonthOverride, setVisibleMonthOverride] = useState<Date | null>(null);
  const [recordDates, setRecordDates] = useState<Set<string>>(new Set());
  const selectedMonth = useMemo(() => startOfMonth(selectedDate), [selectedDate]);
  const visibleMonth = visibleMonthOverride ?? selectedMonth;

  useEffect(() => {
    const from = format(startOfMonth(visibleMonth), "yyyy-MM-dd");
    const to = format(endOfMonth(visibleMonth), "yyyy-MM-dd");
    let active = true;

    void fetch(`/api/daily-entry-dates?from=${from}&to=${to}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load dates");
        const body = (await response.json()) as RecordDatesResponse;
        if (!active) return;
        setRecordDates(new Set(body.dates ?? []));
      })
      .catch(() => {
        if (!active) return;
        setRecordDates(new Set());
      });

    return () => {
      active = false;
    };
  }, [refreshKey, selectedMonth, visibleMonth]);

  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(visibleMonth);
    const monthEnd = endOfMonth(visibleMonth);
    return eachDayOfInterval({
      start: startOfWeek(monthStart, { weekStartsOn: 1 }),
      end: endOfWeek(monthEnd, { weekStartsOn: 1 }),
    });
  }, [visibleMonth]);

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen) setVisibleMonthOverride(null);
      }}
    >
      <DialogTrigger asChild>
        <button
          className="flex w-full items-center justify-between rounded-md border border-stone-200 bg-stone-50 px-4 py-3 text-left text-sm font-medium text-stone-900 sm:w-44 disabled:opacity-50 disabled:cursor-not-allowed"
          type="button"
          disabled={disabled}
        >
          <span>{format(selectedDate, "dd/MM/yyyy")}</span>
          <CalendarDays size={16} className="text-stone-500" />
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-sm p-0">
        <DialogHeader className="border-b border-stone-200 px-4 py-4">
          <DialogTitle>Select date</DialogTitle>
          <DialogDescription>Blue dots show days with at least one active record.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 px-4 py-4">
          <div className="flex items-center justify-between">
            <button
              aria-label="Previous month"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-stone-200 text-stone-600 transition hover:bg-stone-50"
              onClick={() => setVisibleMonthOverride(subMonths(visibleMonth, 1))}
              type="button"
            >
              <ChevronLeft size={16} />
            </button>
            <p className="text-sm font-medium text-stone-900">{format(visibleMonth, "MMMM yyyy")}</p>
            <button
              aria-label="Next month"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-stone-200 text-stone-600 transition hover:bg-stone-50"
              onClick={() => setVisibleMonthOverride(addMonths(visibleMonth, 1))}
              type="button"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium uppercase tracking-wide text-stone-500">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
              <span key={day} className="py-1">
                {day}
              </span>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {calendarDays.map((day) => {
              const iso = format(day, "yyyy-MM-dd");
              const isSelected = isSameDay(day, selectedDate);
              const hasRecord = recordDates.has(iso);

              return (
                <button
                  key={iso}
                  className={cn(
                    "flex aspect-square min-w-0 flex-col items-center justify-center rounded-lg border text-sm transition",
                    isSelected
                      ? "border-emerald-600 bg-emerald-50 font-semibold text-emerald-800"
                      : "border-transparent text-stone-700 hover:border-stone-200 hover:bg-stone-50",
                    !isSameMonth(day, visibleMonth) && "text-stone-300",
                  )}
                  onClick={() => {
                    onChange(iso);
                    setVisibleMonthOverride(null);
                    setOpen(false);
                  }}
                  type="button"
                >
                  <span className={cn("mb-1 h-1.5 w-1.5 rounded-full", hasRecord ? "bg-sky-500" : "bg-transparent")} />
                  <span>{format(day, "d")}</span>
                </button>
              );
            })}
          </div>

          <button
            className="w-full rounded-md border border-stone-200 px-3 py-2 text-sm font-medium text-stone-700 transition hover:bg-stone-50"
            onClick={() => {
              const today = new Date();
              onChange(format(today, "yyyy-MM-dd"));
              setVisibleMonthOverride(null);
              setOpen(false);
            }}
            type="button"
          >
            Jump to today
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
