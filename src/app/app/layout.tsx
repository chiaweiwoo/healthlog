import { AppNav } from "@/components/app/nav";
import { requireSession } from "@/lib/auth";

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  await requireSession();
  return (
    <div className="min-h-screen overflow-x-hidden bg-stone-50 pb-20 sm:pb-0">
      <AppNav />
      {children}
    </div>
  );
}
