import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { ADMIN_COOKIE_NAME, verifySessionToken } from "@/lib/adminAuth";

/** Mark a report resolved (or un-resolve it) from the admin list. */
export async function POST(req: NextRequest) {
  const store = await cookies();
  if (!verifySessionToken(store.get(ADMIN_COOKIE_NAME)?.value)) {
    return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const id = typeof body?.id === "string" ? body.id : null;
  const resolved = body?.resolved !== false;
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  try {
    await prisma.userReport.update({ where: { id }, data: { resolved } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("admin report update failed", err);
    return NextResponse.json({ error: "Could not update" }, { status: 500 });
  }
}
