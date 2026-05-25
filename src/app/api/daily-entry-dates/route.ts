import { NextRequest } from "next/server";
import { getErrorMessage, logUserAction } from "@/lib/action-logs";
import { requireApiSession } from "@/lib/auth";
import { listDailyEntryDates } from "@/lib/db";
import { isoDateSchema } from "@/lib/schemas";

export async function GET(request: NextRequest) {
  const started = Date.now();
  const requestId = crypto.randomUUID();

  try {
    const auth = await requireApiSession(request);
    if (!auth.ok) return auth.response;

    const from = isoDateSchema.parse(request.nextUrl.searchParams.get("from"));
    const to = isoDateSchema.parse(request.nextUrl.searchParams.get("to"));
    const dates = await listDailyEntryDates(from, to);

    await logUserAction({
      requestId,
      route: "/api/daily-entry-dates",
      method: "GET",
      action: "daily_entry_dates.list",
      username: auth.session.username,
      statusCode: 200,
      success: true,
      durationMs: Date.now() - started,
      requestPayload: { from, to },
      responsePayload: { requestId, count: dates.length },
      userAgent: request.headers.get("user-agent"),
    });

    return Response.json({ dates, requestId });
  } catch (error) {
    await logUserAction({
      requestId,
      route: "/api/daily-entry-dates",
      method: "GET",
      action: "daily_entry_dates.list",
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
