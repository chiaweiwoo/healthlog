import "server-only";

import bcrypt from "bcryptjs";
import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextRequest } from "next/server";
import { getEnv, requireEnv } from "@/lib/env";

const cookieName = "healthlog_session";
const sessionTtlSeconds = 60 * 60 * 24 * 3;

type SessionPayload = {
  username: string;
  exp: number;
};

function base64url(input: string | Buffer) {
  return Buffer.from(input).toString("base64url");
}

function fromBase64url(input: string) {
  return Buffer.from(input, "base64url").toString("utf8");
}

async function sign(payload: string) {
  const secret = requireEnv("SESSION_SECRET");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return Buffer.from(signature).toString("base64url");
}

export async function createSessionToken(username: string) {
  const payload: SessionPayload = {
    username,
    exp: Math.floor(Date.now() / 1000) + sessionTtlSeconds,
  };
  const body = base64url(JSON.stringify(payload));
  return `${body}.${await sign(body)}`;
}

export async function verifySessionToken(token?: string | null) {
  if (!token) return null;
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;

  const expected = await sign(body);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length) return null;
  if (!timingSafeEqual(actualBuffer, expectedBuffer)) return null;

  const payload = JSON.parse(fromBase64url(body)) as SessionPayload;
  if (payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}

export async function verifyCredentials(username: string, password: string) {
  const env = getEnv();
  if (!env.APP_USERNAME || !env.APP_PASSWORD_HASH) return false;
  if (username !== env.APP_USERNAME) return false;
  return bcrypt.compare(password, env.APP_PASSWORD_HASH);
}

export async function setSessionCookie(username: string) {
  const cookieStore = await cookies();
  cookieStore.set(cookieName, await createSessionToken(username), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: sessionTtlSeconds,
  });
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(cookieName);
}

export async function getSession() {
  const cookieStore = await cookies();
  return verifySessionToken(cookieStore.get(cookieName)?.value);
}

export async function requireSession() {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

export async function requireApiSession(request: NextRequest) {
  const session = await verifySessionToken(request.cookies.get(cookieName)?.value);
  if (!session) {
    return { ok: false as const, response: Response.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  return { ok: true as const, session };
}
