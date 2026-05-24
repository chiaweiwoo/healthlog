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
  const [error, setError] = useState<string | null>(null);
  const form = useForm<LoginValues>({
    defaultValues: { username: "", password: "" },
  });

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("signedOut") === "1") {
        toast.success("Successfully signed out.");
        const url = new URL(window.location.href);
        url.searchParams.delete("signedOut");
        window.history.replaceState(null, "", url.toString());
      }
    }
  }, []);

  const onSubmit = form.handleSubmit((values) => {
    setError(null);
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
          setError(errorMsg);
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
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <Button className="w-full" disabled={isPending} type="submit">
            {isPending ? "Signing in..." : "Sign in"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
