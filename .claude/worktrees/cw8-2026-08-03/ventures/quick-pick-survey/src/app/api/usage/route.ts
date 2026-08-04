import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, hashToken } from "@/lib/auth";
import { getClientIp, isWriteRateLimited, recordWrite } from "@/lib/rateLimit";
import { parseUsageBatch } from "@/lib/usage";

const MAX_BATCHES_PER_IP = 60;
const RETENTION_DAYS = 30;

export async function POST(req: NextRequest) {
  const parsed = parseUsageBatch(await req.json().catch(() => null));
  if (!parsed) return NextResponse.json({ error: "Invalid usage batch." }, { status: 400 });

  try {
    const user = await getSessionUser();
    if (!user) {
      const ip = getClientIp(req.headers);
      if (await isWriteRateLimited(ip, "usage", MAX_BATCHES_PER_IP)) {
        return NextResponse.json({ error: "Usage limit reached." }, { status: 429 });
      }
      await recordWrite(ip, "usage");
    }

    const sessionKeyHash = hashToken(parsed.sessionKey);
    const [, inserted] = await prisma.$transaction([
      prisma.usageEvent.deleteMany({
        where: { createdAt: { lt: new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000) } },
      }),
      prisma.usageEvent.createMany({
        data: parsed.events.map((event) => ({ ...event, sessionKeyHash, userId: user?.id ?? null })),
        skipDuplicates: true,
      }),
    ]);
    return NextResponse.json({ ok: true, accepted: inserted.count });
  } catch (error) {
    console.error("usage telemetry failed", error);
    return NextResponse.json({ error: "Could not save usage data." }, { status: 500 });
  }
}
