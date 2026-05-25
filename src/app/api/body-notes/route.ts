import { NextRequest } from "next/server";
import { getErrorMessage, logUserAction } from "@/lib/action-logs";
import { requireApiSession } from "@/lib/auth";
import {
  createPendingBodyNote,
  finalizeBodyNoteFailed,
  finalizeBodyNoteParsed,
  getProfile,
  listBodyMeasurements,
  listBodyNotes,
} from "@/lib/db";
import { parseBodyNote } from "@/lib/llm";

export async function GET(request: NextRequest) {
  const started = Date.now();
  const requestId = crypto.randomUUID();
  const auth = await requireApiSession(request);
  if (!auth.ok) return auth.response;
  const [profile, measurements, notes] = await Promise.all([getProfile(), listBodyMeasurements(), listBodyNotes()]);
  await logUserAction({
    requestId,
    route: "/api/body-notes",
    method: "GET",
    action: "body_notes.list",
    username: auth.session.username,
    statusCode: 200,
    success: true,
    durationMs: Date.now() - started,
    responsePayload: { requestId, hasProfile: Boolean(profile), measurementCount: measurements.length, noteCount: notes.length },
    userAgent: request.headers.get("user-agent"),
  });
  return Response.json({ profile, measurements, notes, requestId });
}

export async function POST(request: NextRequest) {
  const started = Date.now();
  const requestId = crypto.randomUUID();
  try {
    const auth = await requireApiSession(request);
    if (!auth.ok) return auth.response;
    const body = await request.json();
    const rawNote = String(body.rawNote ?? "").trim();
    if (!rawNote) return Response.json({ error: "Note is required.", requestId }, { status: 400 });

    let bodyNote = await createPendingBodyNote(rawNote);
    const currentProfile = await getProfile();
    let parsedWarningsCount = 0;
    let profile = currentProfile;
    let measurements = await listBodyMeasurements();
    let changeSummary: {
      action?: string;
      profileChanges: Array<{ field: string; before: unknown; after: unknown }>;
      overrideChanges: Array<{ key: string; before: unknown; after: unknown }>;
      memoryChanges: Array<{ id: string; before: unknown; after: unknown }>;
      addedMeasurements: Array<{ id: string; type: string; value: number; unit: string; measuredAt: string }>;
    } = { profileChanges: [], overrideChanges: [], memoryChanges: [], addedMeasurements: [] };
    try {
      const parsed = await parseBodyNote({ note: rawNote, currentProfile });
      parsedWarningsCount = parsed.warnings.length;
      const result = await finalizeBodyNoteParsed(bodyNote.id, rawNote, parsed);
      bodyNote = result.note;
      profile = result.profile;
      measurements = result.measurements;
      changeSummary = result.changeSummary;
    } catch (parseError) {
      const result = await finalizeBodyNoteFailed(bodyNote.id, parseError);
      bodyNote = result.note;
      profile = result.profile;
      measurements = result.measurements;
      changeSummary = result.changeSummary;
    }
    const notes = await listBodyNotes();
    await logUserAction({
      requestId,
      route: "/api/body-notes",
      method: "POST",
      action: "body_notes.create",
      username: auth.session.username,
      statusCode: 200,
      success: true,
      durationMs: Date.now() - started,
      requestPayload: { rawNote },
      responsePayload: {
        requestId,
        hasProfile: Boolean(profile),
        measurementCount: measurements.length,
        warningsCount: parsedWarningsCount,
        parseStatus: bodyNote.parse_status,
      },
      userAgent: request.headers.get("user-agent"),
    });
    return Response.json({ profile, measurements, notes, bodyNote, changeSummary, requestId });
  } catch (error) {
    await logUserAction({
      requestId,
      route: "/api/body-notes",
      method: "POST",
      action: "body_notes.create",
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
