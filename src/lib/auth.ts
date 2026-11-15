import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const SESSION_COOKIE = "nq_session";
const SECRET = process.env.AUTH_SECRET || "neda-alqalam-dev-secret";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export type Role = "ADMIN" | "OWNER" | "FINANCE" | "TEACHER" | "STAFF";

export interface SessionPayload {
  uid: string;
  role: Role;
  exp: number;
}

export interface AuthUser {
  id: string;
  username: string;
  fullName: string;
  role: Role;
  phone: string;
}

// ---------- password hashing (scrypt, "salt:hash") ----------

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    const [salt, hash] = stored.split(":");
    if (!salt || !hash) return false;
    const candidate = scryptSync(password, salt, 64);
    const expected = Buffer.from(hash, "hex");
    return candidate.length === expected.length && timingSafeEqual(candidate, expected);
  } catch {
    return false;
  }
}

// ---------- session tokens ----------

function sign(data: string): string {
  return createHmac("sha256", SECRET).update(data).digest("base64url");
}

export function createSessionToken(uid: string, role: Role): string {
  const payload: SessionPayload = { uid, role, exp: Date.now() + SESSION_TTL_MS };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body)}`;
}

export function verifySessionToken(token: string | undefined | null): SessionPayload | null {
  if (!token) return null;
  const idx = token.lastIndexOf(".");
  if (idx <= 0) return null;
  const body = token.slice(0, idx);
  const sig = token.slice(idx + 1);
  const expected = sign(body);
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as SessionPayload;
    if (!payload.uid || !payload.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

function readCookie(req: Request, name: string): string | null {
  const header = req.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    if (trimmed.startsWith(`${name}=`)) {
      return decodeURIComponent(trimmed.slice(name.length + 1));
    }
  }
  return null;
}

/** Resolve the logged-in user from the nq_session cookie (or Authorization: Bearer token). */
export async function getSessionUser(req: Request): Promise<AuthUser | null> {
  let token = readCookie(req, SESSION_COOKIE);
  if (!token) {
    const authHeader = req.headers.get("authorization");
    if (authHeader?.startsWith("Bearer ")) token = authHeader.slice(7);
  }
  const payload = verifySessionToken(token);
  if (!payload) return null;
  const user = await db.user.findUnique({ where: { id: payload.uid } });
  if (!user || !user.active) return null;
  return {
    id: user.id,
    username: user.username,
    fullName: user.fullName,
    role: user.role as Role,
    phone: user.phone ?? "",
  };
}

export interface CookieOptions {
  httpOnly: true;
  sameSite: "lax";
  path: "/";
  maxAge: number;
}

export function sessionCookieOptions(): CookieOptions {
  return { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 7 };
}

/**
 * Require an authenticated user with one of `allowedRoles`.
 * Throws a NextResponse (401 {error:"unauthenticated"} / 403 {error:"forbidden"})
 * that the caller should catch and return.
 */
export async function requireUser(req: Request, allowedRoles?: Role[]): Promise<AuthUser> {
  const user = await getSessionUser(req);
  if (!user) throw NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (allowedRoles && allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
    throw NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  return user;
}
