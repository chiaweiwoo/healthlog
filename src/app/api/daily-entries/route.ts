import { NextRequest } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { createDailyEntry, getDailySummary, getProfile, listDailyEntries, patchDailyEntry } from "@/lib/db";
import { parseDailyNote } from "@/lib/llm";
import { isoDateSchema } from "@/lib/schemas";

export async function GET(request: NextRequest) {
  const auth = await requireApiSession(request);
  if (!auth.ok) return auth.response;
  const date = isoDateSchema.parse(request.nextUrl.searchParams.get("date"));
  const [entries, summary] = await Promise.all([listDailyEntries(date), getDailySummary(date)]);
  return Response.json({ entries, summary });
}

export async function POST(request: NextRequest) {
  const auth = await requireApiSession(request);
  if (!auth.ok) return auth.response;
  const body = await request.json();
  const date = isoDateSchema.parse(body.date);
  const rawNote = String(body.rawNote ?? "").trim();
  if (!rawNote) return Response.json({ error: "Note is required." }, { status: 400 });

  const [profile, activeEntries] = await Promise.all([getProfile(), listDailyEntries(date)]);
  const parsed = await parseDailyNote({
    note: rawNote,
    date,
    profile,
    activeEntries: activeEntries.filter((entry) => entry.is_active),
  });
  const entry = await createDailyEntry(date, rawNote, parsed);
  const summary = await getDailySummary(date);
  return Response.json({ entry, summary });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireApiSession(request);
  if (!auth.ok) return auth.response;
  const body = await request.json();
  const id = String(body.id ?? "");
  if (!id) return Response.json({ error: "Entry id is required." }, { status: 400 });

  const entry = await patchDailyEntry(id, {
    isActive: typeof body.isActive === "boolean" ? body.isActive : undefined,
  });
  const summary = await getDailySummary(entry.entry_date);
  return Response.json({ entry, summary });
}

export async function DELETE(request: NextRequest) {
  const auth = await requireApiSession(request);
  if (!auth.ok) return auth.response;
  const id = String(request.nextUrl.searchParams.get("id") ?? "");
  if (!id) return Response.json({ error: "Entry id is required." }, { status: 400 });
  const entry = await patchDailyEntry(id, { isActive: false });
  const summary = await getDailySummary(entry.entry_date);
  return Response.json({ entry, summary });
}
