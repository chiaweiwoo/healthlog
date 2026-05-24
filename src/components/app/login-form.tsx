"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
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

  const onSubmit = form.handleSubmit((values) => {
    setError(null);
    startTransition(async () => {
      const response = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "Sign in failed.");
        return;
      }

      router.replace("/app");
      router.refresh();
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
