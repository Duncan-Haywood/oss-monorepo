import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { selectIdentityPair } from "@/lib/pairing";
import { selectFinancialPair } from "@/lib/financialProfiles";
import { financialFeatureCoverage, paramNames } from "@/lib/financialFit";
import { loadRatedItems } from "@/lib/participantRatings";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const participantId = typeof body?.participantId === "string" ? body.participantId : null;
  if (!participantId) {
    return NextResponse.json({ error: "participantId is required" }, { status: 400 });
  }

  try {
    const participant = await prisma.participant.findUnique({
      where: { id: participantId },
      include: { survey: true },
    });
    if (!participant) {
      return NextResponse.json({ error: "Participant not found" }, { status: 404 });
    }
    const survey = participant.survey;
    if (survey.kind === "ITEMS") {
      return NextResponse.json({ error: "This survey uses /api/trials/next instead" }, { status: 400 });
    }

    const existingFit = await prisma.surveyFit.findUnique({ where: { participantId } });
    const names = paramNames(survey);
    const financialParams = existingFit
      ? (existingFit.params as { name: string; value: number }[])
          .filter((p) => p.name !== "identityWeight")
          .map((p) => p.value)
      : null;

    const coverage = await financialFeatureCoverage(participantId);
    // A conjoined card already carries an identity item, so only ONE financial
    // attribute may move — three things at once isn't a trade-off anyone can
    // answer meaningfully, and the response stops being attributable.
    const slots: 1 | 2 = survey.kind === "CONJOINED" ? 1 : 2;
    const { a, b, linesA, linesB } = selectFinancialPair(
      coverage,
      financialParams ? { params: financialParams, nu: existingFit!.nu } : null,
      Math.random,
      slots
    );

    let identityItemAId: string | null = null;
    let identityItemBId: string | null = null;
    let identityLabelA: string | null = null;
    let identityLabelB: string | null = null;
    let identityCategoryA: string | null = null;
    let identityCategoryB: string | null = null;

    if (survey.kind === "CONJOINED") {
      if (!survey.identitySurveySlug) {
        return NextResponse.json({ error: "CONJOINED survey missing identitySurveySlug" }, { status: 500 });
      }
      const identitySurvey = await prisma.survey.findUnique({
        where: { slug: survey.identitySurveySlug },
        select: { id: true },
      });
      if (!identitySurvey) {
        return NextResponse.json({ error: "Identity survey not seeded" }, { status: 500 });
      }

      // The identity items are rated using THIS participant's own ratings —
      // the ones they built up in the identity survey — never a shared pool.
      const identityItems = await loadRatedItems(participantId, identitySurvey.id);
      if (identityItems.length < 2) {
        return NextResponse.json({ error: "Identity survey not seeded" }, { status: 500 });
      }

      const pastIdentityTrials = await prisma.financialTrial.findMany({
        where: { participantId },
        select: { identityItemAId: true, identityItemBId: true },
      });
      const timesShown = new Map<string, number>();
      for (const t of pastIdentityTrials) {
        if (t.identityItemAId) timesShown.set(t.identityItemAId, (timesShown.get(t.identityItemAId) ?? 0) + 1);
        if (t.identityItemBId) timesShown.set(t.identityItemBId, (timesShown.get(t.identityItemBId) ?? 0) + 1);
      }
      const [pickA, pickB] = selectIdentityPair(
        identityItems.map((i) => ({ id: i.id, rating: i.rating, rd: i.rd })),
        timesShown
      );
      const fullA = identityItems.find((i) => i.id === pickA.id)!;
      const fullB = identityItems.find((i) => i.id === pickB.id)!;
      identityItemAId = fullA.id;
      identityItemBId = fullB.id;
      identityLabelA = fullA.label;
      identityLabelB = fullB.label;
      identityCategoryA = fullA.category;
      identityCategoryB = fullB.category;
    }

    // Randomize which generated side lands in slot A vs B (top/bottom on screen),
    // keeping each profile paired with its own identity item, so a real
    // position bias can't creep into the ratings.
    const sideX = {
      profile: a,
      lines: linesA,
      identityItemId: identityItemAId,
      identityLabel: identityLabelA,
      identityCategory: identityCategoryA,
    };
    const sideY = {
      profile: b,
      lines: linesB,
      identityItemId: identityItemBId,
      identityLabel: identityLabelB,
      identityCategory: identityCategoryB,
    };
    const [slotA, slotB] = Math.random() < 0.5 ? [sideX, sideY] : [sideY, sideX];

    const trial = await prisma.financialTrial.create({
      data: {
        surveyId: survey.id,
        participantId,
        identityItemAId: slotA.identityItemId,
        incomeA: slotA.profile.income,
        netWorthA: slotA.profile.netWorth,
        futurePotentialA: slotA.profile.futurePotential,
        yearsToRealizeA: slotA.profile.yearsToRealize,
        weeklyHoursA: slotA.profile.weeklyHours,
        identityItemBId: slotB.identityItemId,
        incomeB: slotB.profile.income,
        netWorthB: slotB.profile.netWorth,
        futurePotentialB: slotB.profile.futurePotential,
        yearsToRealizeB: slotB.profile.yearsToRealize,
        weeklyHoursB: slotB.profile.weeklyHours,
      },
    });

    // Confidence is this participant's own progress, not the survey's total.
    const answeredCount = await prisma.financialTrial.count({
      where: { participantId, result: { not: null } },
    });

    const targetTrials = names.length * 15; // rough rule of thumb: ~15 trials per coefficient

    return NextResponse.json({
      trialId: trial.id,
      kind: survey.kind,
      profileA: { identityLabel: slotA.identityLabel, identityCategory: slotA.identityCategory, lines: slotA.lines },
      profileB: { identityLabel: slotB.identityLabel, identityCategory: slotB.identityCategory, lines: slotB.lines },
      answeredCount,
      confidence: Math.min(1, answeredCount / targetTrials),
      paramCount: names.length,
    });
  } catch (err) {
    console.error("financial-trials/next failed", err);
    return NextResponse.json({ error: "Could not load the next question" }, { status: 500 });
  }
}
