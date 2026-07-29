/**
 * Linking two accounts and comparing them, against a real database.
 *
 * This is the product's whole point — the app is for couples, and this is the
 * screen they open — and until now not one line of it was covered end to end.
 * Three things are checked here that only a database can answer:
 *
 *  1. The invite can be claimed exactly once, under a race.
 *  2. Nothing but aggregates crosses between two people. A partner's raw
 *     answers leaking into this payload would be the worst bug the app could
 *     have, and it is one line of a `select` away at all times.
 *  3. The confidence gate on the actionable half of the screen holds when the
 *     data is thin, and opens when it isn't — through the real route, not
 *     through the pure functions that are already unit-tested.
 *
 * Needs a database: `scripts/test-db.sh start`, then `npm run test:integration`.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => import("@/test/integration/cookieMock"));

import { prisma } from "@/lib/prisma";
import {
  createAccount,
  createParticipant,
  jsonRequest,
  resetData,
  signInAs,
  signOut,
} from "@/test/integration/db";

import { POST as createInvite } from "./create/route";
import { POST as joinInvite } from "./join/route";
import { GET as compare } from "./compare/route";

/**
 * Plants a well-measured ranking rather than answering several hundred
 * questions to earn one. What is under test here is the route and the gate,
 * not Glicko-2 — the deviations it reaches from real answers are measured in
 * `pairing.simulation.test.ts`, and the statistics in `couples.test.ts`.
 */
async function plantRanking(
  userId: string,
  perspective: "SELF" | "PARTNER" | "PARTNER_GUESS",
  surveySlug: string,
  ratings: Record<string, number>,
  rd = 80
) {
  const participant = await createParticipant(surveySlug, { userId, perspective });
  const items = await prisma.item.findMany({
    where: { survey: { slug: surveySlug }, label: { in: Object.keys(ratings) } },
    select: { id: true, label: true },
  });
  if (items.length !== Object.keys(ratings).length) {
    throw new Error(`Seeded survey "${surveySlug}" is missing some of the labels this test plants`);
  }
  await prisma.participantItemRating.createMany({
    data: items.map((i) => ({
      participantId: participant.id,
      itemId: i.id,
      rating: ratings[i.label],
      rd,
    })),
  });
  return participant;
}

/** The first n labels of a seeded survey, so the test doesn't hardcode content. */
async function labelsOf(slug: string, n: number): Promise<string[]> {
  const items = await prisma.item.findMany({
    where: { survey: { slug } },
    orderBy: { sortOrder: "asc" },
    take: n,
    select: { label: true },
  });
  return items.map((i) => i.label);
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

  return { a, b, inviteCode: invite.inviteCode as string };
}

describe("linking two accounts", () => {
  beforeEach(async () => {
    await resetData();
  });

  it("refuses everything to a signed-out visitor", async () => {
    expect((await createInvite()).status).toBe(401);
    expect((await compare()).status).toBe(401);
    expect(
      (await joinInvite(jsonRequest("http://localhost/api/couple/join", { inviteCode: "ABC123" }))).status
    ).toBe(401);
  });

  it("hands back the same invite code rather than making a second couple", async () => {
    const user = await createAccount();
    await signInAs(user.id);

    const first = await (await createInvite()).json();
    const again = await (await createInvite()).json();

    expect(again.inviteCode).toBe(first.inviteCode);
    expect(await prisma.couple.count()).toBe(1);
  });

  it("lets exactly one person claim an invite, even under a race", async () => {
    const owner = await createAccount(undefined, "Ada");
    await signInAs(owner.id);
    const { inviteCode } = await (await createInvite()).json();
    signOut();

    const joiner = await createAccount(undefined, "Bo");
    await signInAs(joiner.id);
    const [first, second] = await Promise.all([
      joinInvite(jsonRequest("http://localhost/api/couple/join", { inviteCode })),
      joinInvite(jsonRequest("http://localhost/api/couple/join", { inviteCode })),
    ]);
    // One wins; the other is told the invite is taken rather than silently
    // overwriting the join.
    expect([first.status, second.status].sort()).toEqual([200, 409]);

    const couple = await prisma.couple.findFirstOrThrow();
    expect(couple.joinerId).toBe(joiner.id);
    expect(couple.joinedAt).not.toBeNull();
  });

  it("refuses your own code and an unknown one", async () => {
    const user = await createAccount();
    await signInAs(user.id);
    const { inviteCode } = await (await createInvite()).json();

    const own = await joinInvite(jsonRequest("http://localhost/api/couple/join", { inviteCode }));
    expect(own.status).toBe(400);

    const unknown = await joinInvite(
      jsonRequest("http://localhost/api/couple/join", { inviteCode: "NOTREAL" })
    );
    expect(unknown.status).toBe(404);
  });
});

describe("the comparison screen", () => {
  beforeEach(async () => {
    await resetData();
  });

  it("says there is no couple yet rather than failing", async () => {
    const user = await createAccount();
    await signInAs(user.id);

    const body = await (await compare()).json();
    expect(body.couple).toBeNull();
  });

  it("shows the invite code while waiting for the other person", async () => {
    const user = await createAccount();
    await signInAs(user.id);
    const { inviteCode } = await (await createInvite()).json();

    const body = await (await compare()).json();
    expect(body.couple).toEqual({ inviteCode, partner: null });
    expect(body.fit).toBeUndefined();
  });

  it("never sends one partner's raw answers to the other", async () => {
    const { a, b } = await link();
    const labels = await labelsOf("values", 10);
    const rising = Object.fromEntries(labels.map((l, i) => [l, 1400 + i * 20]));
    await plantRanking(a.id, "PARTNER", "values", rising);
    await plantRanking(b.id, "PARTNER", "values", rising);

    await signInAs(a.id);
    const res = await compare();
    const body = await res.json();
    const payload = JSON.stringify(body);

    // The partner is a first name and an id, and nothing else.
    expect(Object.keys(body.couple.partner).sort()).toEqual(["firstName", "id"]);

    // No trial ids, no participant ids, no raw ratings from either side.
    const theirTrials = await prisma.trial.findMany({
      where: { participant: { userId: b.id } },
      select: { id: true },
    });
    for (const t of theirTrials) expect(payload).not.toContain(t.id);
    const theirParticipants = await prisma.participant.findMany({
      where: { userId: b.id },
      select: { id: true },
    });
    for (const p of theirParticipants) expect(payload).not.toContain(p.id);
    // Positions are within-person percentiles; a raw Glicko rating crossing
    // the boundary is how the old "matters more to them" bug got in.
    expect(payload).not.toContain("1400");
  });

  it("keeps the actionable sections shut while the data is thin, and says who it is waiting on", async () => {
    const { a } = await link();

    // Four answers each is what someone has after a minute of swiping.
    const labels = await labelsOf("behaviors", 4);
    await plantRanking(
      a.id,
      "PARTNER",
      "behaviors",
      Object.fromEntries(labels.map((l, i) => [l, 1500 + i * 10])),
      280 // what the deviation actually looks like after a handful of answers
    );

    await signInAs(a.id);
    const body = await (await compare()).json();

    expect(body.makeThemHappy).toEqual([]);
    expect(body.makeYouHappy).toEqual([]);
    expect(body.shared).toEqual([]);
    expect(body.mattersMoreToThem).toEqual([]);

    // Empty is not the same as broken: the screen has to be able to say what
    // it is waiting for, or answering the next question buys nothing visible.
    expect(body.readiness.makeThemHappy.ready).toBe(false);
    expect(body.readiness.makeThemHappy.waitingOn).toBe("them");
    expect(body.readiness.shared.needed).toBeGreaterThan(0);
  });

  it("opens the actionable sections once both sides are measured well enough", async () => {
    const { a, b } = await link();
    const behaviours = await labelsOf("behaviors", 12);
    const relationship = await labelsOf("relationship", 12);

    // Ada's list and Bo's list are deliberately near-opposite on the
    // behaviours, so "matters more to them" has something true to find.
    await plantRanking(
      a.id,
      "PARTNER",
      "behaviors",
      Object.fromEntries(behaviours.map((l, i) => [l, 1400 + i * 25]))
    );
    await plantRanking(
      b.id,
      "PARTNER",
      "behaviors",
      Object.fromEntries(behaviours.map((l, i) => [l, 1700 - i * 25]))
    );
    // ...and they agree on the relationship items, so "shared" does too.
    const agreed = Object.fromEntries(relationship.map((l, i) => [l, 1400 + i * 25]));
    await plantRanking(a.id, "PARTNER", "relationship", agreed);
    await plantRanking(b.id, "PARTNER", "relationship", agreed);

    await signInAs(a.id);
    const body = await (await compare()).json();

    expect(body.readiness.makeThemHappy.ready).toBe(true);
    expect(body.readiness.shared.ready).toBe(true);

    // Something concrete to do for the other person, highest-rated first.
    expect(body.makeThemHappy.length).toBeGreaterThan(0);
    const [top, ...rest] = body.makeThemHappy;
    for (const row of rest) expect(top.rating).toBeGreaterThanOrEqual(row.rating);
    expect(["Behaviour", "Affection", "Relationship"]).toContain(top.category);

    // Common ground, and both of them above their own middle on it.
    expect(body.shared.length).toBeGreaterThan(0);
    for (const row of body.shared) {
      expect(row.aStrength).toBeGreaterThan(50);
      expect(row.bStrength).toBeGreaterThan(50);
    }

    // And a real asymmetry, in points out of 100 rather than raw rating.
    expect(body.mattersMoreToThem.length).toBeGreaterThan(0);
    for (const row of body.mattersMoreToThem) expect(row.gap).toBeGreaterThanOrEqual(20);

    // New shared comparison dimensions
    expect(body.theirBlindSpots).toBeDefined();
    expect(body.selfAlignment).toBeDefined();
    expect(Array.isArray(body.topSharedItems)).toBe(true);
    expect(Array.isArray(body.topSelfMatches)).toBe(true);
  });
});
