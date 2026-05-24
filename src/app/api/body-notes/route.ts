import { NextRequest } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { addBodyMeasurements, getProfile, listBodyMeasurements, upsertProfile } from "@/lib/db";
import { parseBodyNote } from "@/lib/llm";

export async function GET(request: NextRequest) {
  const auth = await requireApiSession(request);
  if (!auth.ok) return auth.response;
  const [profile, measurements] = await Promise.all([getProfile(), listBodyMeasurements()]);
  return Response.json({ profile, measurements });
}

export async function POST(request: NextRequest) {
  const auth = await requireApiSession(request);
  if (!auth.ok) return auth.response;
  const body = await request.json();
  const rawNote = String(body.rawNote ?? "").trim();
  if (!rawNote) return Response.json({ error: "Note is required." }, { status: 400 });

  const currentProfile = await getProfile();
  const parsed = await parseBodyNote({ note: rawNote, currentProfile });
  if (parsed.profile) await upsertProfile(parsed.profile);
  await addBodyMeasurements(parsed.measurements);
  const [profile, measurements] = await Promise.all([getProfile(), listBodyMeasurements()]);
  return Response.json({ profile, measurements, parsed });
}
