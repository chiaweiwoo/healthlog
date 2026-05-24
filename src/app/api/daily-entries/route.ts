import { NextRequest } from "next/server";
import { getErrorMessage, logUserAction } from "@/lib/action-logs";
import { requireApiSession } from "@/lib/auth";
import {
  createPendingDailyEntry,
  finalizeDailyEntryFailed,
  finalizeDailyEntryParsed,
  getDailySummary,
  getProfile,
  listDailyEntries,
  patchDailyEntry,
} from "@/lib/db";
import { parseDailyNote } from "@/lib/llm";
import { isoDateSchema } from "@/lib/schemas";

export async function GET(request: NextRequest) {
  const started = Date.now();
  const requestId = crypto.randomUUID();
  const auth = await requireApiSession(request);
  if (!auth.ok) return auth.response;
  const date = isoDateSchema.parse(request.nextUrl.searchParams.get("date"));
  const [entries, summary] = await Promise.all([listDailyEntries(date), getDailySummary(date)]);
  await logUserAction({
    requestId,
    route: "/api/daily-entries",
    method: "GET",
    action: "daily_entries.list",
    username: auth.session.username,
    statusCode: 200,
    success: true,
    durationMs: Date.now() - started,
    requestPayload: { date },
    responsePayload: { requestId, entryCount: entries.length, hasSummary: Boolean(summary) },
    userAgent: request.headers.get("user-agent"),
  });
  return Response.json({ entries, summary, requestId });
}

export async function POST(request: NextRequest) {
  const started = Date.now();
  const requestId = crypto.randomUUID();
  try {
    const auth = await requireApiSession(request);
    if (!auth.ok) return auth.response;
    const body = await request.json();
    const date = isoDateSchema.parse(body.date);
    const rawNote = String(body.rawNote ?? "").trim();
    if (!rawNote) return Response.json({ error: "Note is required." }, { status: 400 });

    let entry = await createPendingDailyEntry(date, rawNote);
    const [profile, activeEntries] = await Promise.all([getProfile(), listDailyEntries(date)]);
    try {
      const parsed = await parseDailyNote({
        note: rawNote,
        date,
        profile,
        activeEntries: activeEntries.filter((candidate) => candidate.is_active && candidate.id !== entry.id),
      });
      entry = await finalizeDailyEntryParsed(entry.id, parsed);
    } catch (parseError) {
      entry = await finalizeDailyEntryFailed(entry.id, parseError);
    }
    const summary = await getDailySummary(date);
    await logUserAction({
      requestId,
      route: "/api/daily-entries",
      method: "POST",
      action: "daily_entries.create",
      username: auth.session.username,
      statusCode: 200,
      success: true,
      durationMs: Date.now() - started,
      requestPayload: { date, rawNote },
      responsePayload: {
        requestId,
        entryId: entry.id,
        parseStatus: entry.parse_status,
        itemCount: entry.parsed_items.length,
        warningsCount: entry.warnings.length,
        hasSummary: Boolean(summary),
      },
      userAgent: request.headers.get("user-agent"),
    });
    return Response.json({ entry, summary, requestId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not save note.";
    await logUserAction({
      requestId,
      route: "/api/daily-entries",
      method: "POST",
      action: "daily_entries.create",
      statusCode: 500,
      success: false,
      durationMs: Date.now() - started,
      responsePayload: { requestId },
      error,
      userAgent: request.headers.get("user-agent"),
    });
    return Response.json({ error: message, requestId }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const started = Date.now();
  const requestId = crypto.randomUUID();
  try {
    const auth = await requireApiSession(request);
    if (!auth.ok) return auth.response;
    const body = await request.json();
    const id = String(body.id ?? "");
    if (!id) return Response.json({ error: "Entry id is required.", requestId }, { status: 400 });
    let entry = await patchDailyEntry(id, {
      rawNote: typeof body.rawNote === "string" ? body.rawNote.trim() : undefined,
      isActive: typeof body.isActive === "boolean" ? body.isActive : undefined,
    });

    if (typeof body.rawNote === "string" && body.rawNote.trim()) {
      const [profile, activeEntries] = await Promise.all([getProfile(), listDailyEntries(entry.entry_date)]);
      try {
        const parsed = await parseDailyNote({
          note: body.rawNote.trim(),
          date: entry.entry_date,
          profile,
          activeEntries: activeEntries.filter((candidate) => candidate.is_active && candidate.id !== entry.id),
        });
        entry = await finalizeDailyEntryParsed(entry.id, parsed);
      } catch (parseError) {
        entry = await finalizeDailyEntryFailed(entry.id, parseError);
      }
    }
    const summary = await getDailySummary(entry.entry_date);
    await logUserAction({
      requestId,
      route: "/api/daily-entries",
      method: "PATCH",
      action: "daily_entries.update",
      username: auth.session.username,
      statusCode: 200,
      success: true,
      durationMs: Date.now() - started,
      requestPayload: { id, isActive: body.isActive, hasRawNote: typeof body.rawNote === "string" },
      responsePayload: { requestId, entryId: entry.id, parseStatus: entry.parse_status, hasSummary: Boolean(summary) },
      userAgent: request.headers.get("user-agent"),
    });
    return Response.json({ entry, summary, requestId });
  } catch (error) {
    await logUserAction({
      requestId,
      route: "/api/daily-entries",
      method: "PATCH",
      action: "daily_entries.update",
      statusCode: 500,
      success: false,
      durationMs: Date.now() - started,
      responsePayload: { requestId },
      error,
      userAgent: request.headers.get("user-agent"),
    });
    return Response.json({ error: getErrorMessage(error), requestId }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const started = Date.now();
  const requestId = crypto.randomUUID();
  try {
    const auth = await requireApiSession(request);
    if (!auth.ok) return auth.response;
    const id = String(request.nextUrl.searchParams.get("id") ?? "");
    if (!id) return Response.json({ error: "Entry id is required.", requestId }, { status: 400 });
    const entry = await patchDailyEntry(id, { isActive: false });
    const summary = await getDailySummary(entry.entry_date);
    await logUserAction({
      requestId,
      route: "/api/daily-entries",
      method: "DELETE",
      action: "daily_entries.delete",
      username: auth.session.username,
      statusCode: 200,
      success: true,
      durationMs: Date.now() - started,
      requestPayload: { id },
      responsePayload: { requestId, entryId: entry.id, hasSummary: Boolean(summary) },
      userAgent: request.headers.get("user-agent"),
    });
    return Response.json({ entry, summary, requestId });
  } catch (error) {
    await logUserAction({
      requestId,
      route: "/api/daily-entries",
      method: "DELETE",
      action: "daily_entries.delete",
      statusCode: 500,
      success: false,
      durationMs: Date.now() - started,
      responsePayload: { requestId },
      error,
      userAgent: request.headers.get("user-agent"),
    });
    return Response.json({ error: getErrorMessage(error), requestId }, { status: 500 });
  }
}
