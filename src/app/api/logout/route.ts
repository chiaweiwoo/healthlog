import { NextRequest, NextResponse } from "next/server";
import { logUserAction } from "@/lib/action-logs";
import { getSession } from "@/lib/auth";
import { clearSessionCookie } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const started = Date.now();
  const requestId = crypto.randomUUID();
  const session = await getSession();
  await clearSessionCookie();
  await logUserAction({
    requestId,
    route: "/api/logout",
    method: "POST",
    action: "auth.logout",
    username: session?.username ?? null,
    statusCode: 303,
    success: true,
    durationMs: Date.now() - started,
    responsePayload: { requestId, redirectedTo: "/login" },
    userAgent: request.headers.get("user-agent"),
  });
  return NextResponse.redirect(new URL("/login", request.url));
}
