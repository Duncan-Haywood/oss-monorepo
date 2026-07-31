import { NextResponse } from "next/server";

/** Liveness proves the process can serve requests. It deliberately does not
 * touch Postgres: restarting a healthy process cannot repair a database outage. */
export async function GET() {
  const revision = process.env.RELEASE_REVISION;

  return NextResponse.json(
    { status: "ok", ...(revision ? { revision } : {}) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
