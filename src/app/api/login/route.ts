import { NextRequest } from "next/server";
import { setSessionCookie, verifyCredentials } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const username = typeof body?.username === "string" ? body.username : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (!(await verifyCredentials(username, password))) {
    return Response.json({ error: "Invalid username or password." }, { status: 401 });
  }

  await setSessionCookie(username);
  return Response.json({ ok: true });
}
