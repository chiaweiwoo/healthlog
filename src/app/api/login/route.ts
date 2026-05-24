import { NextRequest } from "next/server";
import { logUserAction } from "@/lib/action-logs";
import { setSessionCookie, verifyCredentials } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const started = Date.now();
  const requestId = crypto.randomUUID();
  const body = await request.json().catch(() => null);
  const username = typeof body?.username === "string" ? body.username : "";
  const password = typeof body?.password === "string" ? body.password : "";

  try {
    if (!(await verifyCredentials(username, password))) {
      await logUserAction({
        requestId,
        route: "/api/login",
        method: "POST",
        action: "auth.login",
        username: username || null,
        statusCode: 401,
        success: false,
        durationMs: Date.now() - started,
        requestPayload: { username },
        responsePayload: { requestId },
        error: "Invalid username or password.",
        userAgent: request.headers.get("user-agent"),
      });
      return Response.json({ error: "Invalid username or password.", requestId }, { status: 401 });
    }

    await setSessionCookie(username);
    await logUserAction({
      requestId,
      route: "/api/login",
      method: "POST",
      action: "auth.login",
      username,
      statusCode: 200,
      success: true,
      durationMs: Date.now() - started,
      requestPayload: { username },
      responsePayload: { ok: true, requestId },
      userAgent: request.headers.get("user-agent"),
    });
    return Response.json({ ok: true, requestId });
  } catch (error) {
    await logUserAction({
      requestId,
      route: "/api/login",
      method: "POST",
      action: "auth.login",
      username: username || null,
      statusCode: 500,
      success: false,
      durationMs: Date.now() - started,
      requestPayload: { username },
      responsePayload: { requestId },
      error,
      userAgent: request.headers.get("user-agent"),
    });
    return Response.json({ error: "Login failed.", requestId }, { status: 500 });
  }
}
