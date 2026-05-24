import { NextRequest } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { getDailySummary, recalculateDailySummary } from "@/lib/db";
import { isoDateSchema } from "@/lib/schemas";

export async function POST(request: NextRequest) {
  const auth = await requireApiSession(request);
  if (!auth.ok) return auth.response;
  const body = await request.json();
  const date = isoDateSchema.parse(body.date);
  await recalculateDailySummary(date);
  return Response.json({ summary: await getDailySummary(date) });
}
