/**
 * Who is allowed to read a participant's own numbers.
 *
 * `/api/insights` and `/api/session/status` both take a map of participant
 * ids straight out of the request body. `insights` answers with a full item
 * ranking; `status` answers with how far along each survey is. Neither asked
 * who was calling, so holding an id was sufficient to read either, from
 * anywhere, for as long as the row existed.
 *
 * The app's central promise — stated in `docs/DATA-COLLECTION.md`, held by
 * `couple.integration.test.ts` on the couple route — is that a partner sees
 * aggregate comparisons and never an individual answer. That promise was
 * worth exactly the secrecy of a cuid in localStorage, and the two people
 * this app is built for are the two most likely to share a device.
 *
 * The rule is in `src/lib/participantAccess.ts`: a participant attached to an
 * account is readable only by that account; an anonymous one stays readable
 * by whoever holds its id, because the id is all it has and requiring a
 * sign-in would lock people out of their own answers before they make one.
 *
 * Needs a database: `scripts/test-db.sh start`, then `npm run test:integration`.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => import("@/test/integration/cookieMock"));

import { prisma } from "@/lib/prisma";
import { createAccount, createParticipant, jsonRequest, resetData, signInAs, signOut } from "@/test/integration/db";

import { POST as insights } from "./route";
import { POST as status } from "../session/status/route";

/** A ranking good enough that the insights route has something to report. */
async function plant(participantId: string, slug: string, n = 8) {
  const items = await prisma.item.findMany({
    where: { survey: { slug } },
    orderBy: { sortOrder: "asc" },
    take: n,
    select: { id: true },
  });
  await prisma.participantItemRating.createMany({
    data: items.map((it, i) => ({ participantId, itemId: it.id, rating: 1700 - i * 40, rd: 70 })),
  });
  // Answered trials, so the readiness gates have a count to look at.
  for (let i = 0; i + 1 < items.length; i++) {
    await prisma.trial.create({
      data: {
        participantId,
        itemAId: items[i].id,
        itemBId: items[i + 1].id,
        result: "A",
        answeredAt: new Date(),
        msToAnswer: 1500,
      },
    });
  }
}

function insightsFor(id: string) {
  return jsonRequest("http://localhost/api/insights", { participants: { behaviors: id } });
}

function statusFor(id: string) {
  return jsonRequest("http://localhost/api/session/status", { participants: { behaviors: id } });
}

beforeEach(async () => {
  await resetData();
  signOut();
});

describe("a participant attached to an account", () => {
  it("is readable by that account", async () => {
    const user = await createAccount();
    const p = await createParticipant("behaviors", { userId: user.id });
    await plant(p.id, "behaviors");

    await signInAs(user.id);
    const body = await (await insights(insightsFor(p.id))).json();
    expect(body.itemsRated).toBeGreaterThan(0);
    expect(body.totalAnswers).toBeGreaterThan(0);

    const st = await (await status(statusFor(p.id))).json();
    expect(st.status.behaviors.answeredCount).toBeGreaterThan(0);
  });

  it("is not readable by a different account", async () => {
    // The partner case. Two accounts, one device, one id copied across.
    const owner = await createAccount();
    const other = await createAccount();
    const p = await createParticipant("behaviors", { userId: owner.id });
    await plant(p.id, "behaviors");

    await signInAs(other.id);
    const body = await (await insights(insightsFor(p.id))).json();
    expect(body.itemsRated).toBe(0);
    expect(body.totalAnswers).toBe(0);

    const st = await (await status(statusFor(p.id))).json();
    expect(st.status).toEqual({});
  });

  it("is not readable by someone signed out holding the id", async () => {
    const owner = await createAccount();
    const p = await createParticipant("behaviors", { userId: owner.id });
    await plant(p.id, "behaviors");

    signOut();
    expect((await (await insights(insightsFor(p.id))).json()).itemsRated).toBe(0);
    expect((await (await status(statusFor(p.id))).json()).status).toEqual({});
  });
});

describe("an anonymous participant", () => {
  it("stays readable by whoever holds the id", async () => {
    // Deliberate. Someone answering before they sign up has no credential
    // but the id, and this is the whole onboarding — see participantAccess.ts.
    const p = await createParticipant("behaviors");
    await plant(p.id, "behaviors");

    signOut();
    expect((await (await insights(insightsFor(p.id))).json()).itemsRated).toBeGreaterThan(0);
    expect((await (await status(statusFor(p.id))).json()).status.behaviors).toBeTruthy();
  });

  it("is still readable once its holder signs in to an unrelated account", async () => {
    // The upgrade path: answer signed out, then make an account. The
    // participant is not attached to it yet, and must not vanish.
    const p = await createParticipant("behaviors");
    await plant(p.id, "behaviors");

    const user = await createAccount();
    await signInAs(user.id);
    expect((await (await insights(insightsFor(p.id))).json()).itemsRated).toBeGreaterThan(0);
  });
});

describe("a mixed request", () => {
  it("answers for the caller's own ids and drops the rest", async () => {
    // The client sends whatever is in its storage. One id that is not the
    // caller's should not blank the screen for the ones that are.
    const owner = await createAccount();
    const stranger = await createAccount();
    const mine = await createParticipant("behaviors", { userId: owner.id });
    const theirs = await createParticipant("values", { userId: stranger.id });
    await plant(mine.id, "behaviors");
    await plant(theirs.id, "values");

    await signInAs(owner.id);
    const res = await status(
      jsonRequest("http://localhost/api/session/status", {
        participants: { behaviors: mine.id, values: theirs.id },
      })
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.status.behaviors).toBeTruthy();
    expect(body.status.values).toBeUndefined();
  });

  it("does not fail on an id that does not exist at all", async () => {
    const res = await status(statusFor("not-a-real-participant"));
    expect(res.status).toBe(200);
    expect((await res.json()).status).toEqual({});
  });
});
