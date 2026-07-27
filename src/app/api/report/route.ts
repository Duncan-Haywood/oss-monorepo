import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";

const VALID_KINDS = new Set(["bug", "idea", "other"]);

/** Cheap abuse guard: a handful of reports per IP per hour is plenty. */
const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_WINDOW = 10;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const kind = typeof body?.kind === "string" && VALID_KINDS.has(body.kind) ? body.kind : "other";
  const message = typeof body?.message === "string" ? body.message.trim().slice(0, 4000) : "";
  if (!message) {
    return NextResponse.json({ error: "Tell us a bit more first." }, { status: 400 });
  }

  const email = typeof body?.email === "string" ? body.email.trim().slice(0, 200) || null : null;
  const path = typeof body?.path === "string" ? body.path.slice(0, 300) : null;
  const userAgent = req.headers.get("user-agent")?.slice(0, 300) ?? null;

  try {
    // Rate limit on the LoginAttempt table's pattern, reusing the report
    // table itself rather than adding another one.
    const since = new Date(Date.now() - WINDOW_MS);
    const recent = await prisma.userReport.count({
      where: { createdAt: { gte: since }, userAgent, path },
    });
    if (recent >= MAX_PER_WINDOW) {
      return NextResponse.json({ error: "That's a lot of reports — try again later." }, { status: 429 });
    }

    const user = await getSessionUser();
    await prisma.userReport.create({
      data: { userId: user?.id ?? null, kind, message, email: email ?? user?.email ?? null, path, userAgent },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("report failed", err);
    return NextResponse.json({ error: "Could not send that." }, { status: 500 });
  }
}
