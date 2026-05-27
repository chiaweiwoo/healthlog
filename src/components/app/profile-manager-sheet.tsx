"use client";

import { MessageCircle } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

type Warning = { code: string; message: string; improveWith?: string };

type ProfileNote = {
  id: string;
  raw_note: string;
  parse_status: "pending" | "parsed" | "failed";
  warnings: Warning[];
  parse_error: string | null;
  created_at: string;
};

type ProfileShape = Record<string, unknown> | null;

type BodyMeasurement = {
  id: string;
  measured_at: string;
  type: string;
  value: number;
  unit: string;
  confidence: number;
  remarks: string | null;
  metadata: Record<string, unknown>;
};

type ChangeSummary = {
  action?: string;
  profileChanges: Array<{ field: string; before: unknown; after: unknown }>;
  overrideChanges: Array<{ key: string; before: unknown; after: unknown }>;
  memoryChanges: Array<{ id: string; before: unknown; after: unknown }>;
  addedMeasurements: Array<{ id: string; type: string; value: number; unit: string; measuredAt: string }>;
};

export function ProfileManagerSheet({
  open,
  onOpenChange,
  disabled,
  onSubmitted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  disabled?: boolean;
  onSubmitted: (payload: { profile: ProfileShape; notes: ProfileNote[]; measurements: BodyMeasurement[]; bodyNote?: ProfileNote; changeSummary?: ChangeSummary }) => void;
}) {
  const [note, setNote] = useState("");
  const [isPending, startTransition] = useTransition();

  async function submit() {
    const rawNote = note.trim();
    if (!rawNote) return;
    const toastId = toast.loading("Updating profile...");
    try {
      const response = await fetch("/api/body-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawNote }),
      });
      const body = (await response.json().catch(() => null)) as
        | {
            profile?: ProfileShape;
            notes?: ProfileNote[];
            measurements?: BodyMeasurement[];
            bodyNote?: ProfileNote;
            changeSummary?: ChangeSummary;
            error?: string;
            requestId?: string;
          }
        | null;
      if (!response.ok) {
        const errorMsg = body?.requestId
          ? `${body.error ?? "Could not update profile."} (${body.requestId})`
          : (body?.error ?? "Could not update profile.");
        toast.error(errorMsg, { id: toastId });
        return;
      }
      onSubmitted({
        profile: body?.profile ?? null,
        notes: body?.notes ?? [],
        measurements: body?.measurements ?? [],
        bodyNote: body?.bodyNote,
        changeSummary: body?.changeSummary,
      });
      setNote("");
      onOpenChange(false);
      if (body?.bodyNote?.parse_status === "failed") {
        toast.warning("Saved, but this profile note needs clarification.", { id: toastId });
      } else {
        toast.success("Profile updated.", { id: toastId });
      }
    } catch {
      toast.error("Could not update profile.", { id: toastId });
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
          <DialogTitle>Profile manager</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            disabled={isPending || disabled}
            className="h-32 resize-none rounded-lg border-stone-200 bg-white/80 text-sm"
            placeholder="Tell me about yourself - age, weight, height, goals, habits, dietary preferences... I'll update your profile automatically."
            autoFocus
          />
          <p className="text-[11px] leading-relaxed text-stone-400">
            Use this to add, update, or delete profile context for Daily. Meals, drinks, and workouts still belong on Daily.
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 text-xs font-semibold text-white hover:bg-emerald-700"
              disabled={isPending || !note.trim() || disabled}
              onClick={() => startTransition(submit)}
            >
              <MessageCircle size={14} />
              {isPending ? "Saving..." : "Update profile"}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="rounded-lg border-stone-200 text-xs font-semibold text-stone-700 hover:bg-stone-50"
              onClick={() => handleOpenChange(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
