"use client";

import { AlertTriangle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type Warning = { code: string; message: string; improveWith?: string };

export function WarningDot({
  warnings,
  label = "Warnings",
  className,
}: {
  warnings?: Warning[];
  label?: string;
  className?: string;
}) {
  if (!warnings?.length) return null;

  const preview = warnings[0]?.message ?? "Details available";

  return (
    <Dialog>
      <Tooltip content={<p>{preview}</p>}>
        <DialogTrigger asChild>
          <button
            aria-label={label}
            className={cn(
              "inline-flex h-7 w-7 items-center justify-center rounded-full text-amber-600 transition hover:bg-amber-50 hover:text-amber-700",
              className,
            )}
            type="button"
          >
            <AlertTriangle size={16} />
          </button>
        </DialogTrigger>
      </Tooltip>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{label}</DialogTitle>
          <DialogDescription>These details explain what is uncertain and how to improve the estimate.</DialogDescription>
        </DialogHeader>
        <div className="mt-4 space-y-3">
          {warnings.map((warning, index) => (
            <div key={`${warning.code}-${index}`} className="rounded-md border border-stone-200 bg-stone-50 p-3">
              <p className="text-sm font-medium text-stone-900">{warning.message}</p>
              {warning.improveWith ? <p className="mt-1 text-sm text-stone-600">{warning.improveWith}</p> : null}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
