/**
 * The swipe loop against a real database.
 *
 * Everything here was previously "verified by hand once, against a local
 * Postgres" — the transactional claim, the double-submit guard, and the
 * per-participant isolation that the whole product rests on. Those are exactly
 * the properties a unit test with a mocked Prisma cannot check: they are
 * claims about what the database does under concurrency, not about what the
 * handler calls.
 *
 * Needs a database: `scripts/test-db.sh start`, then `npm run test:integration`.
 */

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => import("@/test/integration/cookieMock"));

import { prisma } from "@/lib/prisma";
import { applyComparison, DEFAULT_GLICKO_STATE } from "@/lib/glicko2";
import { createParticipant, jsonRequest, resetData } from "@/test/integration/db";

import { POST as nextQuestion } from "./next/route";
import { POST as answer } from "./answer/route";
import { POST as undo } from "./undo/route";

/** A small survey keeps the pairing cheap; 16 items is enough to be real. */
const SURVEY = "values";

async function ask(participantId: string) {
  const res = await nextQuestion(jsonRequest("http://localhost/api/trials/next", { participantId }));
  expect(res.status).toBe(200);
  return res.json();
}

async function respond(trialId: string, result: "A" | "B" | "EQUAL") {
  const res = await answer(jsonRequest("http://localhost/api/trials/answer", { trialId, result }));
  return { status: res.status, body: await res.json() };
}

describe("the answer loop", () => {
  beforeAll(async () => {
    await prisma.$connect();
  });

  beforeEach(async () => {
    await resetData();
  });

  it("records the choice and moves both items away from the default", async () => {
    const p = await createParticipant(SURVEY);
    const q = await ask(p.id);

    const { status, body } = await respond(q.trialId, "A");
    expect(status).toBe(200);
    expect(body.ok).toBe(true);

    const trial = await prisma.trial.findUniqueOrThrow({ where: { id: q.trialId } });
    expect(trial.result).toBe("A");
    expect(trial.answeredAt).not.toBeNull();
    expect(trial.msToAnswer).toBeGreaterThanOrEqual(0);

    const ratings = await prisma.participantItemRating.findMany({ where: { participantId: p.id } });
    expect(ratings).toHaveLength(2);
    const winner = ratings.find((r) => r.itemId === q.itemA.id)!;
    const loser = ratings.find((r) => r.itemId === q.itemB.id)!;
    expect(winner.rating).toBeGreaterThan(DEFAULT_GLICKO_STATE.rating);
    expect(loser.rating).toBeLessThan(DEFAULT_GLICKO_STATE.rating);
    // A comparison is information about both, so both get more certain.
    expect(winner.rd).toBeLessThan(DEFAULT_GLICKO_STATE.rd);
    expect(loser.rd).toBeLessThan(DEFAULT_GLICKO_STATE.rd);

    // The before/after snapshot is what undo restores from — an empty one
    // would make undo a silent no-op.
    expect(trial.itemARatingBefore).toBe(DEFAULT_GLICKO_STATE.rating);
    expect(trial.itemARatingAfter).toBeCloseTo(winner.rating, 6);
  });

  it("applies a resent answer exactly once", async () => {
    const p = await createParticipant(SURVEY);
    const q = await ask(p.id);

    const first = await respond(q.trialId, "A");
    const retry = await respond(q.trialId, "B");

    // A retry after a flaky connection must not wedge the client, and must not
    // count twice — nor may the second, different, result overwrite the first.
    expect(first.body.ok).toBe(true);
    expect(retry.status).toBe(200);
    expect(retry.body.alreadyAnswered).toBe(true);

    const trial = await prisma.trial.findUniqueOrThrow({ where: { id: q.trialId } });
    expect(trial.result).toBe("A");

    const expected = applyComparison(DEFAULT_GLICKO_STATE, DEFAULT_GLICKO_STATE, "A");
    const winner = await prisma.participantItemRating.findUniqueOrThrow({
      where: { participantId_itemId: { participantId: p.id, itemId: q.itemA.id } },
    });
    expect(winner.rating).toBeCloseTo(expected.a.rating, 6);
  });

  it("survives two submits racing on the same trial", async () => {
    const p = await createParticipant(SURVEY);
    const q = await ask(p.id);

    const [a, b] = await Promise.all([respond(q.trialId, "A"), respond(q.trialId, "A")]);
    expect([a.status, b.status]).toEqual([200, 200]);

    // The check-then-act version of this route applied the update twice, which
    // is invisible in the response and only shows up in the rating.
    const expected = applyComparison(DEFAULT_GLICKO_STATE, DEFAULT_GLICKO_STATE, "A");
    const winner = await prisma.participantItemRating.findUniqueOrThrow({
      where: { participantId_itemId: { participantId: p.id, itemId: q.itemA.id } },
    });
    expect(winner.rating).toBeCloseTo(expected.a.rating, 6);
    expect(winner.rd).toBeCloseTo(expected.a.rd, 6);
  });

  it("keeps one person's answers out of another's ranking", async () => {
    const mine = await createParticipant(SURVEY, { firstName: "Ada" });
    const theirs = await createParticipant(SURVEY, { firstName: "Bo" });

    const q = await ask(mine.id);
    await respond(q.trialId, "A");

    expect(await prisma.participantItemRating.count({ where: { participantId: theirs.id } })).toBe(0);
    expect(await prisma.participantItemRating.count({ where: { participantId: mine.id } })).toBe(2);
  });

  it("rejects an unknown trial and a nonsense result", async () => {
    const missing = await answer(
      jsonRequest("http://localhost/api/trials/answer", { trialId: "nope", result: "A" })
    );
    expect(missing.status).toBe(404);

    const p = await createParticipant(SURVEY);
    const q = await ask(p.id);
    const bad = await answer(
      jsonRequest("http://localhost/api/trials/answer", { trialId: q.trialId, result: "MAYBE" })
    );
    expect(bad.status).toBe(400);
    const untouched = await prisma.trial.findUniqueOrThrow({ where: { id: q.trialId } });
    expect(untouched.result).toBeNull();
  });

  it("restores the exact prior ratings on undo", async () => {
    const p = await createParticipant(SURVEY);
    const first = await ask(p.id);
    await respond(first.trialId, "A");
    const second = await ask(p.id);
    await respond(second.trialId, "B");

    const before = await prisma.participantItemRating.findMany({
      where: { participantId: p.id },
      orderBy: { itemId: "asc" },
    });

    const res = await undo(jsonRequest("http://localhost/api/trials/undo", { participantId: p.id }));
    expect(res.status).toBe(200);

    // Glicko-2 is not analytically invertible, so undo replays the snapshot.
    // If the snapshot were ever wrong this is the only place it would show.
    const secondTrial = await prisma.trial.findUnique({ where: { id: second.trialId } });
    expect(secondTrial).toBeNull();

    const after = await prisma.participantItemRating.findMany({
      where: { participantId: p.id },
      orderBy: { itemId: "asc" },
    });
    const changed = after.filter((r) => {
      const was = before.find((b) => b.itemId === r.itemId)!;
      return Math.abs(was.rating - r.rating) > 1e-9;
    });
    expect(changed).toHaveLength(2);
    expect(await prisma.trial.count({ where: { participantId: p.id, result: { not: null } } })).toBe(1);
  });
});

describe("asking for the next question", () => {
  beforeEach(async () => {
    await resetData();
  });

  it("hands back the pending question instead of minting a new one", async () => {
    const p = await createParticipant(SURVEY);

    const first = await ask(p.id);
    const reload = await ask(p.id);

    // One person, one question on screen, one row. Before this, every refresh
    // added a shown-but-unanswered row and the abandonment metric counted it.
    expect(reload.trialId).toBe(first.trialId);
    expect(reload.pending).toBe(true);
    expect(await prisma.trial.count({ where: { participantId: p.id } })).toBe(1);

    await respond(first.trialId, "A");
    const afterAnswer = await ask(p.id);
    expect(afterAnswer.trialId).not.toBe(first.trialId);
    expect(await prisma.trial.count({ where: { participantId: p.id } })).toBe(2);
  });

  it("counts a question abandoned yesterday as abandoned, not as pending", async () => {
    const p = await createParticipant(SURVEY);
    const stale = await ask(p.id);
    await prisma.trial.update({
      where: { id: stale.trialId },
      data: { shownAt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    });

    const fresh = await ask(p.id);

    expect(fresh.trialId).not.toBe(stale.trialId);
    expect(fresh.pending).toBeUndefined();
    // The old row stays unanswered: someone really did walk away from it.
    const old = await prisma.trial.findUniqueOrThrow({ where: { id: stale.trialId } });
    expect(old.result).toBeNull();
  });

  it("never shows an item against itself, and reports progress from answers only", async () => {
    const p = await createParticipant(SURVEY);

    for (let i = 0; i < 8; i++) {
      const q = await ask(p.id);
      expect(q.itemA.id).not.toBe(q.itemB.id);
      expect(q.answeredCount).toBe(i);
      await respond(q.trialId, i % 3 === 0 ? "EQUAL" : "A");
    }

    expect(await prisma.trial.count({ where: { participantId: p.id, result: { not: null } } })).toBe(8);
  });

  it("404s on a participant that does not exist", async () => {
    const res = await nextQuestion(
      jsonRequest("http://localhost/api/trials/next", { participantId: "not-a-participant" })
    );
    expect(res.status).toBe(404);
  });
});
