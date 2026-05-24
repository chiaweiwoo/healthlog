import * as React from "react";
import { cn } from "@/lib/utils";

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "h-10 w-full rounded-md border border-stone-300 bg-white px-3 text-[16px] text-stone-950 outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100",
        className,
      )}
      {...props}
    />
  );
}
