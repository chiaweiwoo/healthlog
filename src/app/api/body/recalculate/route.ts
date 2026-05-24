import { NextRequest } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { getProfile, listBodyMeasurements } from "@/lib/db";

export async function POST(request: NextRequest) {
  const auth = await requireApiSession(request);
  if (!auth.ok) return auth.response;
  const [profile, measurements] = await Promise.all([getProfile(), listBodyMeasurements()]);
  return Response.json({ profile, measurements });
}
