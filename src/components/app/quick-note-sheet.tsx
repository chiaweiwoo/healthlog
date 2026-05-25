"use client";

import { format } from "date-fns";
import { NotebookPen } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

type Entry = {
  id: string;
  raw_note: string;
  occurred_time: string | null;
  // Typed as unknown[] here; the consuming component (DailyDashboard) knows the
  // concrete shape from the API and casts at the boundary. This avoids duplicating
  // the full EntryItem/Warning type tree in this file.
  parsed_items: unknown[];
  confidence: number;
  warnings: unknown[];
  remarks: string | null;
  parse_status: "pending" | "parsed" | "failed";
  parse_error: string | null;
  is_active: boolean;
  created_at: string;
};

function getLocalDateString() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function parseDateOnly(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
}

export function QuickNoteSheet({
  open,
  onOpenChange,
  selectedDate,
  disabled,
  onSubmitted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedDate: string;
  disabled?: boolean;
  onSubmitted: (entry: Entry, summary: Record<string, unknown> | null) => void;
}) {
  const [note, setNote] = useState("");
  const [isPending, startTransition] = useTransition();

  const isToday = selectedDate === getLocalDateString();
  const dateLabel = isToday ? null : format(parseDateOnly(selectedDate), "d MMM yyyy");

  async function submit() {
    const rawNote = note.trim();
    if (!rawNote) return;
    const toastId = toast.loading("Saving note...");
    try {
      const response = await fetch("/api/daily-entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: selectedDate, clientToday: getLocalDateString(), rawNote }),
      });
      const body = (await response.json().catch(() => null)) as {
        entry?: Entry;
        summary?: Record<string, unknown>;
        error?: string;
        requestId?: string;
      } | null;
      if (!response.ok) {
        const errorMsg = body?.requestId
          ? `${body.error ?? "Could not save note."} (${body.requestId})`
          : (body?.error ?? "Could not save note.");
        toast.error(errorMsg, { id: toastId });
        return;
      }
      const newEntry = body?.entry;
      if (newEntry?.parse_status === "failed") {
        toast.warning("Saved, but parsing failed. Check warnings.", { id: toastId });
      } else {
        toast.success("Entry added.", { id: toastId });
      }
      if (newEntry) {
        onSubmitted(newEntry, body?.summary ?? null);
      }
      setNote("");
      onOpenChange(false);
    } catch {
      toast.error("Could not save note.", { id: toastId });
    }
  }

  function handleOpenChange(next: boolean) {
    if (isPending) return;
    if (!next) setNote("");
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Log a note
            {dateLabel && (
              <span className="ml-2 text-xs font-normal text-stone-500">— {dateLabel}</span>
            )}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={isPending || disabled}
            placeholder="e.g. 8am: 2 boiled eggs, a cup of coffee. 12pm: chicken rice, 300ml water. 6pm: ran 5km."
            className="bg-white/80 border-stone-200 rounded-lg resize-none h-28 placeholder:text-stone-400 text-sm"
            autoFocus
          />
          <p className="text-[11px] text-stone-400 leading-relaxed">
            Tips: mix English and Chinese, time is optional, you can include food, water, and exercise in one note.
          </p>
          <div className="flex gap-2">
            <Button
              className="flex-1 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50"
              disabled={isPending || !note.trim() || disabled}
              onClick={() => startTransition(submit)}
              type="button"
            >
              <NotebookPen size={14} />
              {isPending ? "Saving..." : "Add Note"}
            </Button>
            <Button
              variant="outline"
              className="rounded-lg text-xs font-semibold border-stone-200 text-stone-700 hover:bg-stone-50 cursor-pointer"
              onClick={() => handleOpenChange(false)}
              disabled={isPending}
              type="button"
            >
              Cancel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
