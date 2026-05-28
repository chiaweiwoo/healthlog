"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type LoginValues = {
  username: string;
  password: string;
};

export function LoginForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [checkingSession, setCheckingSession] = useState(true);
  const form = useForm<LoginValues>({
    defaultValues: { username: "", password: "" },
  });

  useEffect(() => {
    let active = true;
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("signedOut") === "1") {
        toast.success("Successfully signed out.");
        const url = new URL(window.location.href);
        url.searchParams.delete("signedOut");
        window.history.replaceState(null, "", url.toString());
        setTimeout(() => {
          if (active) setCheckingSession(false);
        }, 0);
        return;
      }

      fetch("/api/session")
        .then((res) => res.json())
        .then((body: { authenticated: boolean }) => {
          if (!active) return;
          if (body?.authenticated) {
            toast.success("Restoring session...");
            router.replace("/app");
          } else {
            setCheckingSession(false);
          }
        })
        .catch(() => {
          if (active) setCheckingSession(false);
        });
    }
    return () => {
      active = false;
    };
  }, [router]);

  const onSubmit = form.handleSubmit((values) => {
    const toastId = toast.loading("Signing in...");
    startTransition(async () => {
      try {
        const response = await fetch("/api/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(values),
        });

        const body = (await response.json().catch(() => null)) as { error?: string; requestId?: string } | null;

        if (!response.ok) {
          const errorMsg = body?.requestId ? `${body.error ?? "Sign in failed."} (${body.requestId})` : (body?.error ?? "Sign in failed.");
          toast.error(errorMsg, { id: toastId });
          return;
        }

        toast.success("Signed in successfully!", { id: toastId });
        router.replace("/app");
        router.refresh();
      } catch {
        toast.error("Sign in failed.", { id: toastId });
      }
    });
  });

  if (checkingSession) {
    return (
      <Card className="overflow-hidden">
        <CardContent className="flex flex-col items-center justify-center p-12 space-y-3">
          <div className="w-6 h-6 border-2 border-stone-300 border-t-emerald-700 rounded-full animate-spin" />
          <p className="text-sm font-medium text-stone-500">Checking session...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <CardContent className="space-y-4 p-5">
        <form className="space-y-4" onSubmit={onSubmit}>
          <div className="space-y-2">
            <label className="text-sm font-medium text-stone-700" htmlFor="username">
              Username
            </label>
            <Input id="username" autoComplete="username" {...form.register("username")} />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-stone-700" htmlFor="password">
              Password
            </label>
            <Input id="password" type="password" autoComplete="current-password" {...form.register("password")} />
          </div>
          <Button className="w-full" disabled={isPending} type="submit">
            {isPending ? "Signing in..." : "Sign in"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
