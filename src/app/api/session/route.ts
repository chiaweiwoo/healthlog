import { logUserAction } from "@/lib/action-logs";
import { getSession } from "@/lib/auth";

export async function GET(request: Request) {
  const started = Date.now();
  const requestId = crypto.randomUUID();
  const session = await getSession();
  await logUserAction({
    requestId,
    route: "/api/session",
    method: "GET",
    action: "auth.session",
    username: session?.username ?? null,
    statusCode: 200,
    success: true,
    durationMs: Date.now() - started,
    responsePayload: { requestId, authenticated: Boolean(session) },
    userAgent: request.headers.get("user-agent"),
  });
  return Response.json({ authenticated: Boolean(session), username: session?.username ?? null, requestId });
}
