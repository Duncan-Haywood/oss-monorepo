/**
 * What a couple actually has to answer before the screen has anything on it.
 *
 * Everything else about the couple screen is tested with ratings planted
 * directly — the right call for testing a gate, since it isolates the gate
 * from the estimator. But the product's central question is not "does the
 * gate work", it is **"does a real pair of people, answering real questions
 * through the real routes, ever get past it?"** That has only ever been
 * answered by simulation (`pairing.simulation.test.ts`, which drives the
 * pairing and the Glicko update in-process) or by hand against two live
 * accounts. Neither goes through `trials/next` and `trials/answer`, and the
 * number that matters to a person is the number of taps, not the number of
 * modelled comparisons.
 *
 * So this earns the ratings: two linked accounts answer the behaviours survey
 * one question at a time, over the real handlers and a real database, with a
 * respondent that has genuine preferences and gets them right most of the
 * time. The assertions are deliberately about the *shape* of the answer — the
 * screen opens, and it opens on this order of magnitude of answers — rather
 * than pinning an exact count that every future pairing change would have to
 * come and update here.
 *
 * Needs a database: `scripts/test-db.sh start`, then `npm run test:integration`.
 */

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => import("@/test/integration/cookieMock"));

import { prisma } from "@/lib/prisma";
import { createAccount, createParticipant, jsonRequest, resetData, signInAs, signOut } from "@/test/integration/db";

import { POST as createInvite } from "./create/route";
import { POST as joinInvite } from "./join/route";
import { GET as compare } from "./compare/route";
import { POST as nextQuestion } from "../trials/next/route";
import { POST as answer } from "../trials/answer/route";

/**
 * Sixteen items, one category, all of it actionable — the smallest survey that
 * feeds every section of the couple screen. A bigger one would only measure
 * how long a bigger one takes.
 */
const SURVEY = "behaviors";

/** Answers per person. Small enough to run in seconds, large enough to be real. */
const BUDGET = 70;

function mulberry32(seed: number): () => number {
  let s = seed;
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * One person's session: `budget` questions, each answered against a fixed set
 * of latent preferences.
 *
 * `agreement` is how often they answer in line with those preferences. A
 * perfectly consistent respondent would flatter the whole loop — real people
 * contradict themselves, and the estimator's uncertainty is supposed to
 * reflect that.
 */
async function answerSession(
  participantId: string,
  truth: Map<string, number>,
  seed: number,
  budget = BUDGET,
  agreement = 0.85
) {
  const rand = mulberry32(seed);
  for (let i = 0; i < budget; i++) {
    const asked = await nextQuestion(
      jsonRequest("http://localhost/api/trials/next", { participantId })
    );
    expect(asked.status).toBe(200);
    const q = await asked.json();
    if (q.done) return i;

    const prefersA = (truth.get(q.itemA.id) ?? 0) > (truth.get(q.itemB.id) ?? 0);
    const honest = rand() < agreement;
    const result = prefersA === honest ? "A" : "B";

    const recorded = await answer(
      jsonRequest("http://localhost/api/trials/answer", { trialId: q.trialId, result })
    );
    expect(recorded.status).toBe(200);
  }
  return budget;
}

/** A latent ordering over the survey's items, shared or opposed by seed sign. */
async function latentPreferences(descending: boolean): Promise<Map<string, number>> {
  const items = await prisma.item.findMany({
    where: { survey: { slug: SURVEY } },
    orderBy: { sortOrder: "asc" },
    select: { id: true },
  });
  return new Map(items.map((item, i) => [item.id, descending ? -i : i]));
}

async function link() {
  const a = await createAccount(undefined, "Ada");
  const b = await createAccount(undefined, "Bo");

  await signInAs(a.id);
  const invite = await (await createInvite()).json();
  signOut();

  await signInAs(b.id);
  const joined = await joinInvite(
    jsonRequest("http://localhost/api/couple/join", { inviteCode: invite.inviteCode })
  );
  expect(joined.status).toBe(200);
  signOut();

  return { a, b };
}

describe("a couple who actually answered the questions", () => {
  beforeAll(async () => {
    await prisma.$connect();
  });

  beforeEach(async () => {
    await resetData();
  });

  it("opens the actionable sections on a session someone would sit through", async () => {
    const { a, b } = await link();

    const ada = await createParticipant(SURVEY, { userId: a.id, perspective: "PARTNER", firstName: "Ada" });
    const bo = await createParticipant(SURVEY, { userId: b.id, perspective: "PARTNER", firstName: "Bo" });

    // Near-opposite preferences, so "matters more to them" has something true
    // to find rather than having to invent a difference.
    await signInAs(a.id);
    await answerSession(ada.id, await latentPreferences(false), 11);
    signOut();
    await signInAs(b.id);
    await answerSession(bo.id, await latentPreferences(true), 29);
    signOut();

    await signInAs(a.id);
    const body = await (await compare()).json();

    const measured = await prisma.participantItemRating.count({
      where: { participantId: ada.id, rd: { lt: 200 } },
    });
    console.log(
      `\n${BUDGET} answers each on ${SURVEY} (16 items): ` +
        `${measured}/16 of Ada's items under rd 200, ` +
        `makeThemHappy ${body.makeThemHappy.length}, shared ${body.shared.length}, ` +
        `mattersMoreToThem ${body.mattersMoreToThem.length}\n`
    );

    // The point of the test: this is reachable at all, over the real routes.
    expect(body.readiness.makeThemHappy.ready).toBe(true);
    expect(body.readiness.shared.ready).toBe(true);
    expect(body.makeThemHappy.length).toBeGreaterThan(0);
    expect(body.mattersMoreToThem.length).toBeGreaterThan(0);

    // Earned ratings, not planted ones: every row carries a real deviation,
    // and the estimator is allowed to be uncertain about a noisy answerer.
    for (const row of body.makeThemHappy) {
      expect(row.rd).toBeLessThan(200);
      expect(row.rating).toBeGreaterThan(0);
    }
  });

  it("still says who it is waiting on when only one of them has answered", async () => {
    const { a, b } = await link();

    const ada = await createParticipant(SURVEY, { userId: a.id, perspective: "PARTNER", firstName: "Ada" });
    await createParticipant(SURVEY, { userId: b.id, perspective: "PARTNER", firstName: "Bo" });

    await signInAs(a.id);
    await answerSession(ada.id, await latentPreferences(false), 11);
    signOut();

    await signInAs(a.id);
    const body = await (await compare()).json();

    // Ada did the work; the screen must name Bo rather than showing her a
    // blank half-screen or, worse, comparing her against nothing.
    expect(body.readiness.makeYouHappy.ready).toBe(true);
    expect(body.makeYouHappy.length).toBeGreaterThan(0);
    expect(body.readiness.shared.ready).toBe(false);
    expect(body.readiness.shared.waitingOn).toBe("them");
    expect(body.shared).toEqual([]);
    expect(body.mattersMoreToThem).toEqual([]);
  });
});
