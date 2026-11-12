/**
 * The stored survey prior (lib/surveyPrior.ts, lib/surveyPriorStore.ts):
 * estimated from the survey's respondents, written to the Survey row,
 * recomputed only when enough new answers have arrived, and read by the
 * insights route for the "it's between" set.
 *
 * Needs a database: `scripts/test-db.sh start`, then `npm run test:integration`.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => import("@/test/integration/cookieMock"));

import { prisma } from "@/lib/prisma";
import { pooledPriorPhi, type RefitAnswer } from "@/lib/btRefit";
import { createParticipant, jsonRequest, resetData, signOut, surveyIdBySlug } from "@/test/integration/db";
import { refreshSurveyPrior, storedSurveyPrior } from "./surveyPriorStore";
import { POOL_MIN_RESPONDENTS } from "./surveyPrior";
import { POST as insights } from "@/app/api/insights/route";

async function itemsOf(slug: string, n: number) {
  return prisma.item.findMany({ where: { survey: { slug } }, orderBy: { sortOrder: "asc" }, take: n, select: { id: true, label: true } });
}

/** Writes answers as trials; `a beats b` for each [a, b] pair (ids). */
async function answers(participantId: string, pairs: [string, string][]) {
  await prisma.trial.createMany({
    data: pairs.map(([a, b]) => ({ participantId, itemAId: a, itemBId: b, result: "A" as const, answeredAt: new Date(), msToAnswer: 1500 })),
  });
}

/** One respondent's answers on six items: a chain twice round with one upset each time. */
function chain(ids: string[]): [string, string][] {
  const out: [string, string][] = [];
  for (let r = 0; r < 2; r++) {
    for (let i = 0; i + 1 < ids.length; i++) out.push([ids[i], ids[i + 1]]);
    out.push([ids[ids.length - 1], ids[0]]);
  }
  return out;
}

beforeEach(async () => {
  await resetData();
  signOut();
});

describe("refreshSurveyPrior", () => {
  it("stores no estimate until enough respondents have answered, but records the answer count", async () => {
    const surveyId = await surveyIdBySlug("behaviors");
    const ids = (await itemsOf("behaviors", 6)).map((i) => i.id);
    for (let k = 0; k < POOL_MIN_RESPONDENTS - 1; k++) {
      const p = await createParticipant("behaviors");
      await answers(p.id, chain(ids));
    }
    const stored = await refreshSurveyPrior(surveyId);
    expect(stored).toEqual({ phi: null, respondents: null, answers: (POOL_MIN_RESPONDENTS - 1) * 12 });
    expect(await storedSurveyPrior(surveyId)).toEqual(stored);
  });

  it("stores the pooled estimate over the respondents, and does not recompute until answers grow", async () => {
    const surveyId = await surveyIdBySlug("behaviors");
    const ids = (await itemsOf("behaviors", 6)).map((i) => i.id);
    const pool: { ids: string[]; answers: RefitAnswer[] }[] = [];
    for (let k = 0; k < POOL_MIN_RESPONDENTS; k++) {
      const p = await createParticipant("behaviors");
      const pairs = chain(ids);
      await answers(p.id, pairs);
      pool.push({ ids, answers: pairs.map(([w, l]) => ({ winner: w, loser: l })) });
    }
    const stored = await refreshSurveyPrior(surveyId);
    expect(stored.respondents).toBe(POOL_MIN_RESPONDENTS);
    expect(stored.answers).toBe(POOL_MIN_RESPONDENTS * 12);
    // Same answers, same search: the order of items and answers inside a person does not change the evidence beyond Monte Carlo noise.
    expect(stored.phi).toBeCloseTo(pooledPriorPhi(pool), 1);

    // Mark the stored value so a recompute would show; a few more answers are not enough to refresh.
    await prisma.survey.update({ where: { id: surveyId }, data: { setPriorPhi: 0.777 } });
    const p = await createParticipant("behaviors");
    await answers(p.id, chain(ids).slice(0, 8));
    expect((await refreshSurveyPrior(surveyId)).phi).toBe(0.777);
    // A quarter more answers is.
    await answers(p.id, chain(ids).concat(chain(ids)).slice(0, 30));
    const after = await refreshSurveyPrior(surveyId);
    expect(after.phi).not.toBe(0.777);
    expect(after.respondents).toBe(POOL_MIN_RESPONDENTS + 1);
  });
});

describe("the insights set reads the stored survey prior", () => {
  it("lengthens a person's list when the survey's prior is narrower than their own, and never shortens it", async () => {
    const surveyId = await surveyIdBySlug("behaviors");
    const p = await createParticipant("behaviors");
    const items = await itemsOf("behaviors", 6);
    // A round robin where the earlier item wins three answers in four: the
    // person's own estimate (about 0.55) lists three items; at the survey's
    // 0.3 the leader is shrunk harder and a fourth joins.
    const pairs: [string, string][] = [];
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        for (let k = 0; k < 3; k++) pairs.push([items[i].id, items[j].id]);
        pairs.push([items[j].id, items[i].id]);
      }
    }
    await answers(p.id, pairs);
    const read = async () => (await (await insights(jsonRequest("http://localhost/api/insights", { participants: { behaviors: p.id } }))).json()).content["top-pick"];
    const own = await read();
    expect(own.contested).toBe(true);

    // A survey whose respondents' likes sit close together (the 0.3 floor).
    await prisma.survey.update({ where: { id: surveyId }, data: { setPriorPhi: 0.3, setPriorRespondents: POOL_MIN_RESPONDENTS, setPriorAnswers: 400 } });
    const narrow = await read();
    expect(narrow.rivals.length).toBeGreaterThan(own.rivals.length);
    expect(narrow.rivals.slice(0, own.rivals.length).sort()).toEqual([...own.rivals].sort());

    // A survey whose prior is wider than the person's own changes nothing.
    await prisma.survey.update({ where: { id: surveyId }, data: { setPriorPhi: 2.0 } });
    expect((await read()).rivals).toEqual(own.rivals);

    // Too few respondents behind it: ignored.
    await prisma.survey.update({ where: { id: surveyId }, data: { setPriorPhi: 0.3, setPriorRespondents: POOL_MIN_RESPONDENTS - 1 } });
    expect((await read()).rivals).toEqual(own.rivals);
    expect([own.rivals.length, narrow.rivals.length]).toEqual([3, 4]);
  });
});
