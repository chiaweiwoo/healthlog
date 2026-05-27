"use client";

import Link from "next/link";
import { UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ProfileSetupOverlay({
  title,
  body,
  secondary,
}: {
  title: string;
  body: string;
  secondary: string;
}) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-stone-950/25 px-4">
      <div className="w-full max-w-sm rounded-xl border border-stone-200 bg-stone-50/95 p-5 shadow-xl backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-stone-200 bg-white text-emerald-600">
            <UserRound size={18} />
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400">Setup needed</p>
            <h2 className="text-lg font-bold text-stone-900">{title}</h2>
          </div>
        </div>
        <div className="mt-4 space-y-2 text-sm text-stone-600">
          <p>{body}</p>
          <p>{secondary}</p>
        </div>
        <Button asChild className="mt-5 w-full rounded-lg bg-emerald-600 text-white hover:bg-emerald-700">
          <Link href="/app/profile">Go to Profile</Link>
        </Button>
      </div>
    </div>
  );
}
