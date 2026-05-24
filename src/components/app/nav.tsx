import Link from "next/link";
import { Activity, BarChart3, LogOut, Scale } from "lucide-react";
import { Button } from "@/components/ui/button";

export function AppNav() {
  return (
    <header className="border-b border-stone-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link href="/app" className="flex items-center gap-2 font-semibold text-stone-950">
          <Activity className="text-emerald-700" size={22} />
          HealthLog
        </Link>
        <nav className="flex items-center gap-1">
          <Button asChild variant="ghost" size="sm">
            <Link href="/app">Today</Link>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link href="/app/body">
              <Scale size={16} />
              Body
            </Link>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link href="/app/analysis">
              <BarChart3 size={16} />
              Analysis
            </Link>
          </Button>
          <form action="/api/logout" method="post">
            <Button variant="ghost" size="icon" aria-label="Log out">
              <LogOut size={17} />
            </Button>
          </form>
        </nav>
      </div>
    </header>
  );
}
