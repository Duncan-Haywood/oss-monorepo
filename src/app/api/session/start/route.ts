import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";

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

  const perspective = body?.perspective === "SELF" ? "SELF" : "PARTNER";
  // If signed in, tie these sessions to the account so progress follows the
  // person across devices instead of living only in one browser.
  const user = await getSessionUser();

  const surveys = await prisma.survey.findMany({ orderBy: { createdAt: "asc" } });
  const participants = await Promise.all(
    surveys.map((survey) =>
      prisma.participant.create({
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
      })
    )
  );

  const participantsBySlug: Record<string, string> = {};
  surveys.forEach((s, i) => {
    participantsBySlug[s.slug] = participants[i].id;
  });

  return NextResponse.json({
    firstName,
    perspective,
    participants: participantsBySlug,
    surveys: surveys.map((s) => ({ slug: s.slug, title: s.title, kind: s.kind })),
  });
}
