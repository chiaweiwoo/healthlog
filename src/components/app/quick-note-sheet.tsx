"use client";

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
  parsed_items: unknown[];
  confidence: number;
  warnings: unknown[];
  remarks: string | null;
  parse_status: "pending" | "parsed" | "failed";
  parse_error: string | null;
  is_active: boolean;
  created_at: string;
};

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

  async function submit() {
    const rawNote = note.trim();
    if (!rawNote) return;
    const toastId = toast.loading("Saving note...");
    try {
      const response = await fetch("/api/daily-entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: selectedDate, rawNote }),
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
          <DialogTitle>Log a note</DialogTitle>
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
