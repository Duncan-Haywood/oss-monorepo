/**
 * The pending-reuse rule, and the answer it used to eat.
 *
 * `trials/next` hands a shown-but-unanswered pair back for 30 minutes so a
 * reload does not mint a new row. That is right for a reload and wrong for the
 * request the client fires *while an answer is still saving*: it returned the
 * row about to be answered, the person was shown the identical pair, answered
 * it again, and `trials/answer` replied `{ok: true, alreadyAnswered: true}` —
 * a 200 for an answer nobody kept. Roughly half of every session's taps.
 *
 * The browser journey in `e2e/anonymous-comparison.spec.ts` is what found it
 * and is the honest end-to-end proof. This is the cheap guard beside it: it
 * runs in the `database` CI job, which needs no browser and no build, so the
 * rule stays enforced on every pull request even when the journeys do not run.
 *
 * Needs a database: `scripts/test-db.sh start`, then `npm run test:integration`.
 */

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => import("@/test/integration/cookieMock"));

import { prisma } from "@/lib/prisma";
import { createParticipant, jsonRequest, resetData } from "@/test/integration/db";

import { POST as nextQuestion } from "./next/route";
import { POST as answer } from "./answer/route";

const SURVEY = "values";

async function ask(participantId: string, answeringTrialId?: string) {
  const res = await nextQuestion(
    jsonRequest("http://localhost/api/trials/next", { participantId, answeringTrialId }),
  );
  expect(res.status).toBe(200);
  return res.json();
}

describe("asking for the next pair while an answer is in flight", () => {
  beforeAll(async () => {
    await prisma.$connect();
  });

  beforeEach(async () => {
    await resetData();
  });

  it("reuses the pending pair when nothing is being answered", async () => {
    const p = await createParticipant(SURVEY);
    const first = await ask(p.id);

    // The reload case. This is the behaviour the exclusion must not break.
    const again = await ask(p.id);
    expect(again.trialId).toBe(first.trialId);
    expect(again.pending).toBe(true);
  });

  it("never hands back the trial whose answer has not landed yet", async () => {
    const p = await createParticipant(SURVEY);
    const shown = await ask(p.id);

    // Exactly the client's ordering: ask for the next pair before the save for
    // the current one has been applied.
    const upcoming = await ask(p.id, shown.trialId);

    expect(upcoming.trialId).not.toBe(shown.trialId);
    expect(upcoming.pending).toBeUndefined();
  });

  it("keeps both answers when the next pair is fetched mid-save", async () => {
    const p = await createParticipant(SURVEY);
    const first = await ask(p.id);
    const second = await ask(p.id, first.trialId);

    for (const trialId of [first.trialId, second.trialId]) {
      const res = await answer(jsonRequest("http://localhost/api/trials/answer", { trialId, result: "A" }));
      expect(res.status).toBe(200);
      // The tell. Before the fix the second call answered the first row and
      // came back `alreadyAnswered`, with a 200 and no answer recorded.
      expect(await res.json()).not.toHaveProperty("alreadyAnswered");
    }

    const recorded = await prisma.trial.count({ where: { participantId: p.id, result: { not: null } } });
    expect(recorded).toBe(2);
  });

  it("still reuses a pending row when the excluded id is not the pending one", async () => {
    const p = await createParticipant(SURVEY);
    const first = await ask(p.id);
    const second = await ask(p.id, first.trialId);

    // Naming an unrelated trial must not suppress the reload behaviour for the
    // row actually on screen — otherwise every refresh mints a new question
    // again and the abandonment metric goes back to being meaningless.
    const reloaded = await ask(p.id, first.trialId);
    expect(reloaded.trialId).toBe(second.trialId);
    expect(reloaded.pending).toBe(true);
  });
});
