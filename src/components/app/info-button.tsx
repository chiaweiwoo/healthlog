"use client";

import { Info } from "lucide-react";
import type { ReactNode } from "react";
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

export function InfoButton({
  title,
  description,
  className,
  children,
}: {
  title: string;
  description: ReactNode;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <Dialog>
      <Tooltip content={<p className="max-w-56">{typeof description === "string" ? description : "More details"}</p>}>
        <DialogTrigger asChild>
          <button
            aria-label={title}
            className={cn(
              "inline-flex h-7 w-7 items-center justify-center rounded-full text-stone-500 transition hover:bg-stone-100 hover:text-stone-700",
              className,
            )}
            type="button"
          >
            {children ?? <Info size={16} />}
          </button>
        </DialogTrigger>
      </Tooltip>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-3 text-sm text-stone-600">{description}</div>
          </DialogDescription>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  );
}
