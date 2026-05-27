import { NextRequest } from "next/server";
import { getErrorMessage, logUserAction } from "@/lib/action-logs";
import { requireApiSession } from "@/lib/auth";
import { getDailySummary, recalculateAllDailySummaries, recalculateDailySummary } from "@/lib/db";
import { isoDateSchema } from "@/lib/schemas";
import { invalidateAnalysisCache } from "@/lib/analysis-invalidation";


export async function POST(request: NextRequest) {
  const started = Date.now();
  const requestId = crypto.randomUUID();
  try {
    const auth = await requireApiSession(request);
    if (!auth.ok) return auth.response;
    const body = await request.json();
    const all = body?.all === true;
    if (all) {
      const summaries = await recalculateAllDailySummaries();
      await logUserAction({
        requestId,
        route: "/api/daily-summaries/recalculate",
        method: "POST",
        action: "daily_summaries.recalculate",
        username: auth.session.username,
        statusCode: 200,
        success: true,
        durationMs: Date.now() - started,
        requestPayload: { all: true },
        responsePayload: { requestId, recalculatedCount: summaries.length },
        userAgent: request.headers.get("user-agent"),
      });
      invalidateAnalysisCache();
      return Response.json({ summaries, requestId });
    }

    const date = isoDateSchema.parse(body.date);
    await recalculateDailySummary(date);
    const summary = await getDailySummary(date);
    await logUserAction({
      requestId,
      route: "/api/daily-summaries/recalculate",
      method: "POST",
      action: "daily_summaries.recalculate",
      username: auth.session.username,
      statusCode: 200,
      success: true,
      durationMs: Date.now() - started,
      requestPayload: { date },
      responsePayload: { requestId, hasSummary: Boolean(summary) },
      userAgent: request.headers.get("user-agent"),
    });
    invalidateAnalysisCache();
    return Response.json({ summary, requestId });
  } catch (error) {
    await logUserAction({
      requestId,
      route: "/api/daily-summaries/recalculate",
      method: "POST",
      action: "daily_summaries.recalculate",
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
