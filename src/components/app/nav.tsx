"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, BarChart3, Home, LogOut, Scale } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/app", label: "Today", icon: Home },
  { href: "/app/body", label: "Body", icon: Scale },
  { href: "/app/analysis", label: "Analysis", icon: BarChart3 },
];

export function AppNav() {
  const pathname = usePathname();

  return (
    <>
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link href="/app" className="flex items-center gap-2 font-semibold text-stone-950">
            <Activity className="text-emerald-700" size={22} />
            HealthLog
          </Link>
          <nav className="hidden items-center gap-1 sm:flex">
            {navItems.map((item) => (
              <Button key={item.href} asChild variant={pathname === item.href ? "outline" : "ghost"} size="sm">
                <Link href={item.href}>
                  <item.icon size={16} />
                  {item.label}
                </Link>
              </Button>
            ))}
            <form action="/api/logout" method="post">
              <Button variant="ghost" size="icon" aria-label="Log out">
                <LogOut size={17} />
              </Button>
            </form>
          </nav>
          <form action="/api/logout" method="post" className="sm:hidden">
            <Button variant="ghost" size="icon" aria-label="Log out">
              <LogOut size={17} />
            </Button>
          </form>
        </div>
      </header>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-stone-200 bg-white/95 px-2 py-2 shadow-[0_-8px_20px_rgba(0,0,0,0.04)] backdrop-blur sm:hidden">
        <div className="mx-auto grid max-w-md grid-cols-3 gap-1">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex min-h-14 flex-col items-center justify-center rounded-md px-2 text-xs font-medium text-stone-500 transition",
                pathname === item.href ? "bg-emerald-50 text-emerald-700" : "hover:bg-stone-50 hover:text-stone-800",
              )}
            >
              <item.icon size={18} />
              <span className="mt-1">{item.label}</span>
            </Link>
          ))}
        </div>
      </nav>
    </>
  );
}
