import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { perspectiveOrDefault } from "@/lib/perspective";

function cleanString(value: unknown, maxLen: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLen);
}

/**
 * Creates one Participant per survey, all sharing the same intro info, so a
 * single session can pull questions from any domain without re-asking who's
 * answering. This is what backs the unified, domain-blocked flow on "/".
 *
 * For a signed-in account the participants for a (perspective, survey) pair
 * are REUSED rather than recreated. Switching between "in a partner" and
 * "what I think they want" and back has to land on the answers already
 * given — the profile screen promises exactly that, and creating a fresh
 * participant on every switch silently reset visible progress to zero.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const firstName = cleanString(body?.firstName, 60);
  if (!firstName) {
    return NextResponse.json({ error: "firstName is required" }, { status: 400 });
  }
  const lastName = cleanString(body?.lastName, 60);
  const email = cleanString(body?.email, 120);
  const sex = cleanString(body?.sex, 30);
  const ethnicity = cleanString(body?.ethnicity, 60);
  const countryOfResidence = cleanString(body?.countryOfResidence, 60);
  let age: number | null = null;
  if (typeof body?.age === "number" && Number.isFinite(body.age)) {
    age = Math.round(Math.max(13, Math.min(120, body.age)));
  }

  const perspective = perspectiveOrDefault(body?.perspective);

  try {
    // If signed in, tie these sessions to the account so progress follows the
    // person across devices instead of living only in one browser.
    const user = await getSessionUser();

    const surveys = await prisma.survey.findMany({ orderBy: { createdAt: "asc" } });
    if (surveys.length === 0) {
      return NextResponse.json({ error: "No surveys are set up yet." }, { status: 503 });
    }

    const reusable = new Map<string, string>();
    if (user) {
      const existing = await prisma.participant.findMany({
        where: { userId: user.id, perspective },
        orderBy: { lastSeenAt: "desc" },
        select: { id: true, surveyId: true },
      });
      // Most recently used first, so the first id seen per survey is the one
      // the rest of the app would have resumed to anyway.
      for (const p of existing) {
        if (!reusable.has(p.surveyId)) reusable.set(p.surveyId, p.id);
      }
      if (reusable.size > 0) {
        // Touch them so `lastSeenAt` really means "the perspective this
        // account is currently in". /api/auth/me resumes from that ordering,
        // and without the touch a switch back to an older perspective would
        // be invisible to any other device.
        await prisma.participant.updateMany({
          where: { id: { in: [...reusable.values()] } },
          data: { perspective },
        });
      }
    }

    const participantIds = await Promise.all(
      surveys.map(async (survey) => {
        const existingId = reusable.get(survey.id);
        if (existingId) return existingId;
        const created = await prisma.participant.create({
          data: {
            surveyId: survey.id,
            userId: user?.id ?? null,
            perspective,
            firstName,
            lastName,
            email,
            sex,
            age,
            ethnicity,
            countryOfResidence,
          },
        });
        return created.id;
      })
    );

    const participantsBySlug: Record<string, string> = {};
    surveys.forEach((s, i) => {
      participantsBySlug[s.slug] = participantIds[i];
    });

    return NextResponse.json({
      firstName,
      perspective,
      participants: participantsBySlug,
      surveys: surveys.map((s) => ({ slug: s.slug, title: s.title, kind: s.kind })),
    });
  } catch (err) {
    console.error("session/start failed", err);
    return NextResponse.json({ error: "Could not start a session." }, { status: 500 });
  }
}
