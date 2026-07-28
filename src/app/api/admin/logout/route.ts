import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ADMIN_COOKIE_NAME } from "@/lib/adminAuth";

export async function POST() {
  try {
    const store = await cookies();
    store.delete(ADMIN_COOKIE_NAME);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("admin/logout failed", err);
    return NextResponse.json({ error: "Could not sign out" }, { status: 500 });
  }
}
