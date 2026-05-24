import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase";

type LogUserActionInput = {
  requestId: string;
  route: string;
  method: string;
  action: string;
  username?: string | null;
  statusCode: number;
  success: boolean;
  durationMs: number;
  requestPayload?: unknown;
  responsePayload?: unknown;
  error?: unknown;
  userAgent?: string | null;
};

function serializeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack ?? null,
    };
  }

  return {
    message: typeof error === "string" ? error : "Unknown error",
  };
}

export async function logUserAction(input: LogUserActionInput) {
  try {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from("app_request_logs").insert({
      request_id: input.requestId,
      route: input.route,
      method: input.method,
      action: input.action,
      username: input.username ?? null,
      status_code: input.statusCode,
      success: input.success,
      duration_ms: input.durationMs,
      request_payload: input.requestPayload ?? {},
      response_payload: input.responsePayload ?? null,
      error_payload: input.error ? serializeError(input.error) : null,
      user_agent: input.userAgent ?? null,
    });

    if (error) {
      console.error("Failed to write app_request_logs row", error);
    }
  } catch (error) {
    console.error("Failed to log user action", error);
  }
}

export function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") {
    return error.message;
  }
  return "Unexpected error.";
}
