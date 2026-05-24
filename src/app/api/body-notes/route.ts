import { NextRequest } from "next/server";
import { getErrorMessage, logUserAction } from "@/lib/action-logs";
import { requireApiSession } from "@/lib/auth";
import { addBodyMeasurements, getProfile, listBodyMeasurements, upsertProfile } from "@/lib/db";
import { parseBodyNote } from "@/lib/llm";

export async function GET(request: NextRequest) {
  const started = Date.now();
  const requestId = crypto.randomUUID();
  const auth = await requireApiSession(request);
  if (!auth.ok) return auth.response;
  const [profile, measurements] = await Promise.all([getProfile(), listBodyMeasurements()]);
  await logUserAction({
    requestId,
    route: "/api/body-notes",
    method: "GET",
    action: "body_notes.list",
    username: auth.session.username,
    statusCode: 200,
    success: true,
    durationMs: Date.now() - started,
    responsePayload: { requestId, hasProfile: Boolean(profile), measurementCount: measurements.length },
    userAgent: request.headers.get("user-agent"),
  });
  return Response.json({ profile, measurements, requestId });
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

    const currentProfile = await getProfile();
    const parsed = await parseBodyNote({ note: rawNote, currentProfile });
    if (parsed.profile) await upsertProfile(parsed.profile);
    await addBodyMeasurements(parsed.measurements);
    const [profile, measurements] = await Promise.all([getProfile(), listBodyMeasurements()]);
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
        measurementCount: parsed.measurements.length,
        warningsCount: parsed.warnings.length,
      },
      userAgent: request.headers.get("user-agent"),
    });
    return Response.json({ profile, measurements, parsed, requestId });
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
