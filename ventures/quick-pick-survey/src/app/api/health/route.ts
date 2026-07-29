import { NextResponse } from "next/server";

/** Liveness proves the process can serve requests. It deliberately does not
 * touch Postgres: restarting a healthy process cannot repair a database outage. */
export async function GET() {
  return NextResponse.json(
    { status: "ok" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
