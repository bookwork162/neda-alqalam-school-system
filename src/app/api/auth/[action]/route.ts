import { NextRequest, NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  createSessionToken,
  getSessionUser,
  hashPassword,
  requireUser,
  sessionCookieOptions,
  verifyPassword,
} from "@/lib/auth";
import { db } from "@/lib/db";

type Ctx = { params: Promise<{ action: string }> };

function json(data: unknown, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

function bad(message: string, status = 400): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

async function safeBody(req: NextRequest): Promise<Record<string, unknown>> {
  try {
    return (await req.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/** POST /api/auth/login | logout | password | profile */
export async function POST(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const { action } = await ctx.params;
  const body = await safeBody(req);

  // ---------- login ----------
  if (action === "login") {
    const username = String(body.username ?? "").trim();
    const password = String(body.password ?? "");
    if (!username || !password) return bad("username و password لازم است");
    const user = await db.user.findUnique({ where: { username } });
    if (!user || !user.active || !verifyPassword(password, user.passwordHash)) {
      return bad("نام کاربری یا پلمب نادرست است", 401);
    }
    await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await db.auditLog.create({
      data: {
        userId: user.id,
        action: "login",
        entity: "User",
        entityId: user.id,
        detail: JSON.stringify({ username: user.username, role: user.role }),
      },
    });
    const res = NextResponse.json({
      user: { id: user.id, username: user.username, fullName: user.fullName, role: user.role },
    });
    res.cookies.set({
      name: SESSION_COOKIE,
      value: createSessionToken(user.id, user.role as never),
      ...sessionCookieOptions(),
    });
    return res;
  }

  // ---------- logout ----------
  if (action === "logout") {
    const res = NextResponse.json({ ok: true });
    res.cookies.set({ name: SESSION_COOKIE, value: "", ...sessionCookieOptions(), maxAge: 0 });
    return res;
  }

  // ---------- change own password ----------
  if (action === "password") {
    let user;
    try {
      user = await requireUser(req);
    } catch (e) {
      return e as NextResponse;
    }
    const currentPassword = String(body.currentPassword ?? "");
    const newPassword = String(body.newPassword ?? "");
    if (!currentPassword || !newPassword) return bad("رمز فعلی و رمز جدید لازم است");
    if (newPassword.length < 6) return bad("رمز جدید باید حداقل ۶ حرف باشد");
    const record = await db.user.findUnique({ where: { id: user.id } });
    if (!record || !verifyPassword(currentPassword, record.passwordHash)) {
      return bad("رمز فعلی نادرست است", 403);
    }
    await db.user.update({
      where: { id: user.id },
      data: { passwordHash: hashPassword(newPassword) },
    });
    return json({ ok: true });
  }

  // ---------- update own profile ----------
  if (action === "profile") {
    let user;
    try {
      user = await requireUser(req);
    } catch (e) {
      return e as NextResponse;
    }
    const data: Record<string, string> = {};
    if (body.fullName !== undefined) data.fullName = String(body.fullName).trim();
    if (body.phone !== undefined) data.phone = String(body.phone).trim();
    const updated = await db.user.update({ where: { id: user.id }, data });
    return json({
      user: {
        id: updated.id,
        username: updated.username,
        fullName: updated.fullName,
        role: updated.role,
        phone: updated.phone ?? "",
      },
    });
  }

  return bad("عملیات نامعلوم", 404);
}

/** GET /api/auth/me */
export async function GET(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const { action } = await ctx.params;
  if (action !== "me") return bad("عملیات نامعلوم", 404);
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  return json({
    user: { id: user.id, username: user.username, fullName: user.fullName, role: user.role, phone: user.phone },
  });
}
