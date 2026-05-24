import "server-only";

import { createClient } from "@supabase/supabase-js";
import { requireEnv } from "@/lib/env";

export function getSupabaseAdmin() {
  return createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    db: {
      schema: "healthlog",
    },
  });
}
