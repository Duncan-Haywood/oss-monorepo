import { NextResponse } from "next/server";
import { destroySession } from "@/lib/auth";

export async function POST() {
  try {
    await destroySession();
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("auth/logout failed", err);
    return NextResponse.json({ error: "Could not sign out" }, { status: 500 });
  }
}
