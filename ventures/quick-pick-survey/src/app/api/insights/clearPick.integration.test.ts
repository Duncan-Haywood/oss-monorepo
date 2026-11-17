/**
 * The insights screen's "clear top pick" and "clear bottom pick" claims come
 * from a refit of the person's own answers (lib/btRefit.ts) and the one-sided
 * 95% rule in lib/clearPick.ts, not from the stored Glicko states and the old
 * "ahead of the runner-up by half the leader's rd" rule, which named the wrong
 * item in more than half of its claims on synthetic respondents
 * (docs/INFORMATION-GAIN-SELECTOR.md, "The clear-top-pick claim").
 *
 * Needs a database: `scripts/test-db.sh start`, then `npm run test:integration`.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => import("@/test/integration/cookieMock"));

import { prisma } from "@/lib/prisma";
import { createParticipant, jsonRequest, resetData, signOut } from "@/test/integration/db";

import { POST as insights } from "./route";

async function itemsOf(slug: string, n: number) {
  return prisma.item.findMany({ where: { survey: { slug } }, orderBy: { sortOrder: "asc" }, take: n, select: { id: true, label: true } });
}

async function answer(participantId: string, a: string, b: string, result: "A" | "B" | "EQUAL", times = 1) {
  for (let k = 0; k < times; k++) {
    await prisma.trial.create({ data: { participantId, itemAId: a, itemBId: b, result, answeredAt: new Date(), msToAnswer: 1500 } });
  }
}

async function read(id: string) {
  const res = await insights(jsonRequest("http://localhost/api/insights", { participants: { behaviors: id } }));
  return res.json();
}

beforeEach(async () => {
  await resetData();
  signOut();
});

describe("the clear-pick claims", () => {
  it("does not call a leader clear on stored ratings the answers do not support", async () => {
    const p = await createParticipant("behaviors");
    const items = await itemsOf("behaviors", 3);
    // Stored states the old rule called clear: 1700 - 1660 = 40 > 0.5 * 70.
    await prisma.participantItemRating.createMany({
      data: items.map((it, i) => ({ participantId: p.id, itemId: it.id, rating: 1700 - i * 40, rd: 70 })),
    });
    // One answer each way between the top two, one for the second over the third.
    await answer(p.id, items[0].id, items[1].id, "A");
    await answer(p.id, items[1].id, items[0].id, "A");
    await answer(p.id, items[1].id, items[2].id, "A");
    const body = await read(p.id);
    expect(body.content["top-pick"].contested).toBe(true);
    expect(body.content["top-pick"].rivals.length).toBeGreaterThan(1);
  });

  it("calls a leader clear when the answers back it, and the same for the bottom", async () => {
    const p = await createParticipant("behaviors");
    const [a, b, c, d] = await itemsOf("behaviors", 4);
    await answer(p.id, a.id, b.id, "A", 12);
    await answer(p.id, a.id, c.id, "A", 12);
    await answer(p.id, a.id, d.id, "A", 12);
    await answer(p.id, b.id, c.id, "EQUAL", 6);
    await answer(p.id, d.id, b.id, "B", 12);
    await answer(p.id, d.id, c.id, "B", 12);
    const body = await read(p.id);
    expect(body.content["top-pick"]).toMatchObject({ label: a.label, contested: false });
    expect(body.content["bottom-pick"]).toMatchObject({ label: d.label, contested: false });
    // The tie keeps b and c together in the middle.
    const rb = body.content["top-pick"].rating;
    expect(rb).toBeGreaterThan(1500);
  });

  it("lists every item the answers have not ruled out as favourite, not just the three highest", async () => {
    const p = await createParticipant("behaviors");
    const items = await itemsOf("behaviors", 6);
    // Five items each beat the sixth often and are never compared with each
    // other: no answer separates them, so all five could be the favourite.
    // The route before 2026-11-12 named only the three highest-rated.
    for (const it of items.slice(0, 5)) await answer(p.id, it.id, items[5].id, "A", 8);
    const body = await read(p.id);
    expect(body.content["top-pick"].contested).toBe(true);
    expect([...body.content["top-pick"].rivals].sort()).toEqual(items.slice(0, 5).map((i) => i.label).sort());
  });

  it("draws the contender list from the person's own prior spread: mild preferences keep more items in it", async () => {
    const p = await createParticipant("behaviors");
    const items = await itemsOf("behaviors", 6);
    // A round robin where the earlier item wins two answers in three: a clear
    // order but mild preferences. The fixed prior (sd 2.0) reads the spread as
    // wide and lists the first four; the person's empirical-Bayes prior
    // (lib/btRefit.ts, empiricalPriorPhi) reads it as narrow and keeps the
    // fifth too (chances 0.49/0.27/0.14/0.06/0.03 against 0.34/0.25/0.17/0.12/0.07).
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        await answer(p.id, items[i].id, items[j].id, "A", 2);
        await answer(p.id, items[i].id, items[j].id, "B", 1);
      }
    }
    const body = await read(p.id);
    expect(body.content["top-pick"]).toMatchObject({ label: items[0].label, contested: true });
    expect(body.content["top-pick"].rivals).toEqual(items.slice(0, 5).map((i) => i.label));
  });
});
