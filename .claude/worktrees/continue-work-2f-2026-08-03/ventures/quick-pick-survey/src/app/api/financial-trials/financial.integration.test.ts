/**
 * The financial and conjoined loop against a real database.
 *
 * This was the largest remaining coverage gap: two routes that fit a
 * statistical model *inside* the request, and the only ones that write a
 * person's identity ratings into a second model. Everything asserted here is
 * a claim about what the database does — a row not created, a second answer
 * losing a race, one participant's fit not seeing another's answers — which is
 * exactly what a mocked Prisma client cannot check.
 *
 * Needs a database: `scripts/test-db.sh start`, then `npm run test:integration`.
 */

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => import("@/test/integration/cookieMock"));

import { prisma } from "@/lib/prisma";
import { createParticipant, jsonRequest, resetData, surveyIdBySlug } from "@/test/integration/db";

import { POST as nextQuestion } from "./next/route";
import { POST as answer } from "./answer/route";

async function ask(participantId: string) {
  const res = await nextQuestion(
    jsonRequest("http://localhost/api/financial-trials/next", { participantId }),
  );
  expect(res.status).toBe(200);
  return res.json();
}

async function respond(trialId: string, result: "A" | "B" | "EQUAL") {
  const res = await answer(jsonRequest("http://localhost/api/financial-trials/answer", { trialId, result }));
  return { status: res.status, body: await res.json() };
}

/** Answers `n` questions, always picking the top card. */
async function answerRun(participantId: string, n: number) {
  for (let i = 0; i < n; i++) {
    const q = await ask(participantId);
    await respond(q.trialId, "A");
  }
}

type Sides = {
  incomeA: number; netWorthA: number; futurePotentialA: number; yearsToRealizeA: number; weeklyHoursA: number;
  incomeB: number; netWorthB: number; futurePotentialB: number; yearsToRealizeB: number; weeklyHoursB: number;
};

/** How many attributes side A is strictly better on. */
function sideWins(t: Sides): number {
  let wins = 0;
  if (t.incomeA > t.incomeB) wins++;
  if (t.netWorthA > t.netWorthB) wins++;
  if (t.futurePotentialA > t.futurePotentialB) wins++;
  if (t.weeklyHoursA < t.weeklyHoursB) wins++; // fewer hours is better
  // Sooner is better, but only when there is a payout to wait for — a
  // horizon on nothing is not an advantage.
  if (t.futurePotentialA > 0 && t.futurePotentialA === t.futurePotentialB && t.yearsToRealizeA < t.yearsToRealizeB) {
    wins++;
  }
  return wins;
}

function swap(t: Sides): Sides {
  return {
    incomeA: t.incomeB, netWorthA: t.netWorthB, futurePotentialA: t.futurePotentialB,
    yearsToRealizeA: t.yearsToRealizeB, weeklyHoursA: t.weeklyHoursB,
    incomeB: t.incomeA, netWorthB: t.netWorthA, futurePotentialB: t.futurePotentialA,
    yearsToRealizeB: t.yearsToRealizeA, weeklyHoursB: t.weeklyHoursA,
  };
}

describe("the financial loop", () => {
  beforeAll(async () => {
    await prisma.$connect();
  });

  beforeEach(async () => {
    await resetData();
  });

  it("shows a real trade-off: two sides, neither dominating the other", async () => {
    const p = await createParticipant("financial");
    const q = await ask(p.id);

    expect(q.kind).toBe("FINANCIAL");
    // Two attributes move on a financial card, and each side is better on one
    // of them. A card where one side simply wins teaches the model nothing.
    expect(q.profileA.lines).toHaveLength(2);
    expect(q.profileB.lines).toHaveLength(2);
    expect(q.profileA.lines.map((l: { text: string }) => l.text)).not.toEqual(
      q.profileB.lines.map((l: { text: string }) => l.text),
    );

    const row = await prisma.financialTrial.findUniqueOrThrow({ where: { id: q.trialId } });
    // Neither side may dominate: each has to be better on at least one of the
    // attributes that moved. A card where one side simply wins teaches the
    // model nothing, because every answer to it is the same answer.
    expect(sideWins(row)).toBeGreaterThan(0);
    expect(sideWins(swap(row))).toBeGreaterThan(0);
  });

  it("hands back the question already on screen instead of minting a new row", async () => {
    // The bug this covers: a row per call made a refresh indistinguishable
    // from someone who saw a question and walked away, so the abandonment
    // metric counted reloads and crawlers. Fixed on `trials/next` first; this
    // route kept the old behaviour because its card text could not be rebuilt
    // from the stored row.
    const p = await createParticipant("financial");
    const first = await ask(p.id);
    const second = await ask(p.id);

    expect(second.trialId).toBe(first.trialId);
    expect(second.pending).toBe(true);
    expect(second.profileA).toEqual(first.profileA);
    expect(second.profileB).toEqual(first.profileB);
    expect(await prisma.financialTrial.count({ where: { participantId: p.id } })).toBe(1);
  });

  it("moves on once the pending question is answered", async () => {
    const p = await createParticipant("financial");
    const first = await ask(p.id);
    await respond(first.trialId, "A");
    const second = await ask(p.id);

    expect(second.trialId).not.toBe(first.trialId);
    expect(second.pending).toBeUndefined();
    expect(second.answeredCount).toBe(1);
  });

  it("treats a question abandoned long enough ago as abandoned", async () => {
    const p = await createParticipant("financial");
    const stale = await ask(p.id);
    await prisma.financialTrial.update({
      where: { id: stale.trialId },
      data: { shownAt: new Date(Date.now() - 31 * 60 * 1000) },
    });

    const fresh = await ask(p.id);
    expect(fresh.trialId).not.toBe(stale.trialId);
    // The old row is left alone: somebody really did walk away from it.
    const abandoned = await prisma.financialTrial.findUniqueOrThrow({ where: { id: stale.trialId } });
    expect(abandoned.result).toBeNull();
  });

  it("records an answer once, however many times it is sent", async () => {
    const p = await createParticipant("financial");
    const q = await ask(p.id);

    expect((await respond(q.trialId, "A")).body).toEqual({ ok: true });
    const retry = await respond(q.trialId, "B");
    expect(retry.status).toBe(200);
    expect(retry.body.alreadyAnswered).toBe(true);

    const row = await prisma.financialTrial.findUniqueOrThrow({ where: { id: q.trialId } });
    expect(row.result).toBe("A"); // the retry did not overwrite the real answer
  });

  it("applies one answer when two submits race on the same trial", async () => {
    const p = await createParticipant("financial");
    const q = await ask(p.id);

    const [x, y] = await Promise.all([respond(q.trialId, "A"), respond(q.trialId, "B")]);
    const applied = [x, y].filter((r) => !r.body.alreadyAnswered);
    expect(applied).toHaveLength(1);

    expect(await prisma.financialTrial.count({ where: { participantId: p.id, result: { not: null } } })).toBe(1);
  });

  it("refuses a result that is not one of the three", async () => {
    const p = await createParticipant("financial");
    const q = await ask(p.id);
    const res = await answer(
      jsonRequest("http://localhost/api/financial-trials/answer", { trialId: q.trialId, result: "MAYBE" }),
    );
    expect(res.status).toBe(400);
    expect((await prisma.financialTrial.findUniqueOrThrow({ where: { id: q.trialId } })).result).toBeNull();
  });

  it("fits a model on the first answer, then refits on a throttle", async () => {
    // The refit re-optimises over the participant's whole history inside the
    // request, so it cannot run on every answer — but a model that only
    // appears after five answers would leave the first questions unguided.
    // The first answer fits; after that it is every fifth.
    const p = await createParticipant("financial");
    await answerRun(p.id, 1);
    const first = await prisma.surveyFit.findUniqueOrThrow({ where: { participantId: p.id } });
    expect(first.nTrials).toBe(1);

    await answerRun(p.id, 7);
    const later = await prisma.surveyFit.findUniqueOrThrow({ where: { participantId: p.id } });
    expect(later.nTrials).toBe(6); // refit at 6, not again until 11
    expect(await prisma.financialTrial.count({ where: { participantId: p.id, result: { not: null } } })).toBe(8);

    const params = later.params as { name: string; value: number; se: number }[];
    expect(params.map((x) => x.name)).toEqual([
      "income",
      "netWorth",
      "futurePotential",
      "yearsToRealize",
      "weeklyHours",
    ]);
    for (const param of params) expect(Number.isFinite(param.value)).toBe(true);
  });

  it("never lets one person's answers reach another person's model", async () => {
    // The property the whole product rests on, restated for the second of the
    // two models: ratings are per participant, and so are fits.
    const mine = await createParticipant("financial", { firstName: "Mine" });
    const theirs = await createParticipant("financial", { firstName: "Theirs" });

    await answerRun(mine.id, 8);

    expect(await prisma.surveyFit.findUnique({ where: { participantId: theirs.id } })).toBeNull();
    const fit = await prisma.surveyFit.findUniqueOrThrow({ where: { participantId: mine.id } });
    expect(fit.nTrials).toBeGreaterThanOrEqual(6);
    expect(await prisma.financialTrial.count({ where: { participantId: theirs.id, result: { not: null } } })).toBe(0);
  });

  it("counts progress per participant, not per survey", async () => {
    const mine = await createParticipant("financial", { firstName: "Mine" });
    const theirs = await createParticipant("financial", { firstName: "Theirs" });

    await answerRun(mine.id, 3);
    const q = await ask(theirs.id);
    expect(q.answeredCount).toBe(0);
    expect(q.confidence).toBe(0);
  });

  it("refuses to serve an item survey from this route", async () => {
    const p = await createParticipant("values");
    const res = await nextQuestion(
      jsonRequest("http://localhost/api/financial-trials/next", { participantId: p.id }),
    );
    expect(res.status).toBe(400);
  });

  it("404s an unknown participant rather than creating anything", async () => {
    const res = await nextQuestion(
      jsonRequest("http://localhost/api/financial-trials/next", { participantId: "nope" }),
    );
    expect(res.status).toBe(404);
    expect(await prisma.financialTrial.count()).toBe(0);
  });
});

describe("the conjoined loop", () => {
  beforeAll(async () => {
    await prisma.$connect();
  });

  beforeEach(async () => {
    await resetData();
  });

  it("puts one identity item on each side, and only one financial trade-off", async () => {
    const p = await createParticipant("conjoined");
    const q = await ask(p.id);

    expect(q.kind).toBe("CONJOINED");
    expect(q.profileA.identityLabel).toBeTruthy();
    expect(q.profileB.identityLabel).toBeTruthy();
    expect(q.profileA.identityLabel).not.toBe(q.profileB.identityLabel);
    // Two identity items plus two financial attributes is three things to
    // weigh at once, and the answer stops being attributable to any of them.
    expect(q.profileA.lines).toHaveLength(1);
    expect(q.profileB.lines).toHaveLength(1);
    expect(q.paramCount).toBe(6); // identityWeight + the five financial features
  });

  it("replays a pending conjoined card with its identity items intact", async () => {
    const p = await createParticipant("conjoined");
    const first = await ask(p.id);
    const second = await ask(p.id);

    expect(second.trialId).toBe(first.trialId);
    expect(second.profileA.identityLabel).toBe(first.profileA.identityLabel);
    expect(second.profileB.identityLabel).toBe(first.profileB.identityLabel);
    expect(second.profileA.identityCategory).toBe(first.profileA.identityCategory);
  });

  it("weights identity by the answerer's own ratings, never a shared pool", async () => {
    // Two participants who rated the same item in opposite directions must
    // produce different identity utilities for the same card. This is the
    // conjoined survey's version of "ratings are per participant".
    const combinedId = await surveyIdBySlug("combined");
    const items = await prisma.item.findMany({ where: { surveyId: combinedId }, take: 2, orderBy: { id: "asc" } });

    const enthusiast = await createParticipant("conjoined", { firstName: "Enthusiast" });
    const sceptic = await createParticipant("conjoined", { firstName: "Sceptic" });
    await prisma.participantItemRating.createMany({
      data: [
        { participantId: enthusiast.id, itemId: items[0].id, rating: 1900, rd: 60, volatility: 0.06 },
        { participantId: enthusiast.id, itemId: items[1].id, rating: 1200, rd: 60, volatility: 0.06 },
        { participantId: sceptic.id, itemId: items[0].id, rating: 1200, rd: 60, volatility: 0.06 },
        { participantId: sceptic.id, itemId: items[1].id, rating: 1900, rd: 60, volatility: 0.06 },
      ],
    });

    for (const p of [enthusiast, sceptic]) {
      // One planted trial each, identical in every respect except whose
      // ratings the identity side is scored against.
      await prisma.financialTrial.create({
        data: {
          surveyId: await surveyIdBySlug("conjoined"),
          participantId: p.id,
          identityItemAId: items[0].id,
          incomeA: 300_000, netWorthA: 1_500_000, futurePotentialA: 0, yearsToRealizeA: 0, weeklyHoursA: 40,
          identityItemBId: items[1].id,
          incomeB: 300_000, netWorthB: 1_500_000, futurePotentialB: 0, yearsToRealizeB: 0, weeklyHoursB: 40,
          result: "A",
          answeredAt: new Date(),
        },
      });
      // Force a fit off one trial: the throttle only exists to keep latency
      // bounded, and here the single row is the whole point.
      const { refitParticipant } = await import("@/lib/financialFit");
      await refitParticipant(p.id, { force: true });
    }

    const weightOf = async (participantId: string) => {
      const fit = await prisma.surveyFit.findUniqueOrThrow({ where: { participantId } });
      return (fit.params as { name: string; value: number }[]).find((x) => x.name === "identityWeight")!.value;
    };

    // Same answer, opposite ratings behind it: the fitted identity weights
    // must have opposite signs. Pooled ratings would make them equal.
    expect(await weightOf(enthusiast.id)).toBeGreaterThan(0);
    expect(await weightOf(sceptic.id)).toBeLessThan(0);
  });
});
