import * as React from "react";
import { cn } from "@/lib/utils";

export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(
        "min-h-28 w-full resize-y rounded-md border border-stone-300 bg-white px-3 py-2 text-[16px] text-stone-950 outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100",
        className,
      )}
      {...props}
    />
  );
}
