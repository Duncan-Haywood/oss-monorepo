import { after, NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, isValidEmail } from "@/lib/auth";
import { getClientIp, isWriteRateLimited, recordWrite } from "@/lib/rateLimit";
import { createGiteaIssue } from "@/lib/gitea";
import { parsePerspective } from "@/lib/perspective";

const VALID_KINDS = new Set(["bug", "confusing", "question", "idea", "other"]);
const VALID_IMPACTS = new Set(["blocked", "hard", "minor"]);

/**
 * Like `/api/feedback`, this route takes an anonymous POST on purpose —
 * someone hitting a bug before they have made an account is precisely who
 * needs to be able to report it — and `docs/ROUTES.md` described it as
 * account-only anyway.
 *
 * It did have a guard, and the guard's comment said "per IP". It counted
 * recent rows matching the caller's `userAgent` **and** `path`, both of
 * which are supplied by the caller: changing the user-agent string on each
 * request reset it to zero. It never bounded anything. The per-IP limiter
 * every other anonymous write uses replaces it, so this is one rule in one
 * place rather than a second implementation that drifts.
 *
 * 10 in the limiter's fifteen-minute window. A person filing a real report
 * files one.
 */
const MAX_REPORTS_PER_IP = 10;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const kind = typeof body?.kind === "string" && VALID_KINDS.has(body.kind) ? body.kind : "other";
  const message = typeof body?.message === "string" ? body.message.trim().slice(0, 4000) : "";
  if (!message) {
    return NextResponse.json({ error: "Tell us a bit more first." }, { status: 400 });
  }

  const email = typeof body?.email === "string" ? body.email.trim().slice(0, 200) || null : null;
  if (email && !isValidEmail(email)) {
    return NextResponse.json({ error: "That email address doesn't look right." }, { status: 400 });
  }
  const path = typeof body?.path === "string" && body.path.startsWith("/") ? body.path.slice(0, 300) : null;
  const impact = typeof body?.impact === "string" && VALID_IMPACTS.has(body.impact) ? body.impact : null;
  const perspective = parsePerspective(body?.perspective);
  const userAgent = req.headers.get("user-agent")?.slice(0, 300) ?? null;

  try {
    const user = await getSessionUser();

    if (!user) {
      const ip = getClientIp(req.headers);
      if (await isWriteRateLimited(ip, "report", MAX_REPORTS_PER_IP)) {
        return NextResponse.json({ error: "That's a lot of reports — try again later." }, { status: 429 });
      }
      await recordWrite(ip, "report");
    }
    const report = await prisma.userReport.create({
      data: { userId: user?.id ?? null, kind, impact, perspective, message, email: email ?? user?.email ?? null, path, userAgent },
    });
    const reference = report.id.slice(-8).toUpperCase();
    if (process.env.GITEA_URL && process.env.GITEA_TOKEN) {
      after(() => createGiteaIssue({
        kind: kind as "bug" | "confusing" | "question" | "idea" | "other",
        message,
        email: email ?? user?.email,
        path,
        impact,
        perspective,
        reference,
      }));
    }

    return NextResponse.json({ ok: true, reference });
  } catch (err) {
    console.error("report failed", err);
    return NextResponse.json({ error: "Could not send that." }, { status: 500 });
  }
}
