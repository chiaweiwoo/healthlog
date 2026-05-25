"use client";

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

export function FullTextDialog({
  title,
  text,
  className,
  previewClassName,
  description,
  label,
  trigger,
}: {
  title: string;
  text: string;
  className?: string;
  previewClassName?: string;
  description?: string;
  label?: string;
  trigger?: React.ReactNode;
}) {
  return (
    <Dialog>
      <Tooltip content={<p className="max-w-56 break-words">{text}</p>}>
        <DialogTrigger asChild>
          {trigger ?? (
            <button className={cn("w-full text-left", className)} type="button">
              <span className={cn("block", previewClassName)}>{label || text}</span>
            </button>
          )}
        </DialogTrigger>
      </Tooltip>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <p className="mt-2 break-words text-sm text-stone-700">{text}</p>
      </DialogContent>
    </Dialog>
  );
}
