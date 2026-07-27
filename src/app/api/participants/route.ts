import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function cleanString(value: unknown, maxLen: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLen);
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const surveySlug = typeof body?.surveySlug === "string" ? body.surveySlug : null;
  const firstName = cleanString(body?.firstName, 60);

  if (!surveySlug || !firstName) {
    return NextResponse.json({ error: "surveySlug and firstName are required" }, { status: 400 });
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

  const survey = await prisma.survey.findUnique({ where: { slug: surveySlug } });
  if (!survey) {
    return NextResponse.json({ error: "Survey not found" }, { status: 404 });
  }

  const participant = await prisma.participant.create({
    data: { surveyId: survey.id, firstName, lastName, email, sex, age, ethnicity, countryOfResidence },
  });

  return NextResponse.json({ participantId: participant.id });
}
