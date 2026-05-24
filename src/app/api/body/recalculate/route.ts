import { NextRequest } from "next/server";
import { logUserAction } from "@/lib/action-logs";
import { requireApiSession } from "@/lib/auth";
import { getProfile, listBodyMeasurements } from "@/lib/db";

export async function POST(request: NextRequest) {
  const started = Date.now();
  const requestId = crypto.randomUUID();
  const auth = await requireApiSession(request);
  if (!auth.ok) return auth.response;
  const [profile, measurements] = await Promise.all([getProfile(), listBodyMeasurements()]);
  await logUserAction({
    requestId,
    route: "/api/body/recalculate",
    method: "POST",
    action: "body.recalculate",
    username: auth.session.username,
    statusCode: 200,
    success: true,
    durationMs: Date.now() - started,
    responsePayload: { requestId, hasProfile: Boolean(profile), measurementCount: measurements.length },
    userAgent: request.headers.get("user-agent"),
  });
  return Response.json({ profile, measurements, requestId });
}
