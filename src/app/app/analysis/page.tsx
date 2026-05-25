import { BarChart3 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function AnalysisPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-stone-950">Analysis</h1>
        <p className="mt-1 text-sm text-stone-600">Weekly analysis coming later.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 size={18} className="text-emerald-700" />
            Future weekly review
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 text-sm text-stone-600 sm:grid-cols-3">
            <div className="rounded-md border border-stone-200 p-3">
              <p className="font-medium text-stone-900">Nutrition trend</p>
              <p className="mt-1">Calories, macros, and deficit patterns.</p>
            </div>
            <div className="rounded-md border border-stone-200 p-3">
              <p className="font-medium text-stone-900">Exercise balance</p>
              <p className="mt-1">Steps, workouts, and energy burn context.</p>
            </div>
            <div className="rounded-md border border-stone-200 p-3">
              <p className="font-medium text-stone-900">Profile context</p>
              <p className="mt-1">Profile changes, memory, and body-related context over time.</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
