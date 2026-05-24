import { redirect } from "next/navigation";
import { LoginForm } from "@/components/app/login-form";
import { getSession } from "@/lib/auth";

export default async function LoginPage() {
  if (await getSession()) redirect("/app");

  return (
    <main className="flex min-h-svh items-start justify-center px-4 pb-10 pt-[12vh] sm:items-center sm:pt-10">
      <div className="w-full max-w-sm sm:max-w-md">
        <div className="mb-5 sm:mb-6">
          <p className="text-sm font-medium text-emerald-700">HealthLog</p>
          <h1 className="mt-2 text-2xl font-semibold text-stone-950">Sign in</h1>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
