import { redirect } from "next/navigation";
import { LoginForm } from "@/components/app/login-form";
import { getSession } from "@/lib/auth";

export default async function LoginPage() {
  if (await getSession()) redirect("/app");

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6">
          <p className="text-sm font-medium text-emerald-700">HealthLog</p>
          <h1 className="mt-2 text-2xl font-semibold text-stone-950">Sign in</h1>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
