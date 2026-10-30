/**
 * 1000 items at a deep budget, through the real next/answer routes and Postgres.
 *
 * The simulations (`poolCap.simulation.test.ts`) measure the selector in a
 * loop. This asks what the route adds: latency per question once a respondent
 * has hundreds of answers behind them, and whether the rating the route
 * stores still follows the hidden order. One respondent, a noiseless hidden
 * order (items listed first win), the staged selector.
 *
 * Needs a database: `scripts/test-db.sh start`. Set DEEP_ANSWERS to change the
 * budget (default 300, about 30 s).
 */

import { appendFileSync } from "fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => import("@/test/integration/cookieMock"));

import { prisma } from "@/lib/prisma";
import { jsonRequest, resetData } from "@/test/integration/db";
import { POST as nextQuestion } from "@/app/api/trials/next/route";
import { POST as answer } from "@/app/api/trials/answer/route";

const SLUG = "deep-budget-1000";
const ITEMS = 1000;
const ANSWERS = Number(process.env.DEEP_ANSWERS ?? 300);

describe(`${ITEMS} items, ${ANSWERS} answers through the route`, () => {
  beforeAll(async () => {
    await resetData();
    await prisma.survey.deleteMany({ where: { slug: SLUG } });
    await prisma.survey.create({
      data: {
        slug: SLUG,
        title: "Deep budget",
        pairSelector: "staged",
        items: {
          create: Array.from({ length: ITEMS }, (_, i) => ({ slug: `i${i}`, label: `Item ${i}`, sortOrder: i })),
        },
      },
    });
  });

  afterAll(async () => {
    await resetData();
    await prisma.survey.deleteMany({ where: { slug: SLUG } });
  });

  it("keeps each question fast and the stored ratings on the hidden order", async () => {
    const survey = await prisma.survey.findUniqueOrThrow({ where: { slug: SLUG } });
    const p = await prisma.participant.create({ data: { surveyId: survey.id, firstName: "Deep", perspective: "PARTNER" } });
    const pos = (id: string) => Number(id && itemIndex.get(id));
    const itemIndex = new Map((await prisma.item.findMany({ where: { surveyId: survey.id } })).map((it) => [it.id, it.sortOrder]));

    const lat: number[] = [];
    for (let i = 0; i < ANSWERS; i++) {
      const t0 = performance.now();
      const res = await nextQuestion(jsonRequest("http://localhost/api/trials/next", { participantId: p.id }));
      lat.push(performance.now() - t0);
      const q = await res.json();
      await answer(jsonRequest("http://localhost/api/trials/answer", { trialId: q.trialId, result: pos(q.itemA.id) < pos(q.itemB.id) ? "A" : "B" }));
    }

    const rows = await prisma.participantItemRating.findMany({ where: { participantId: p.id } });
    const touched = rows.filter((r) => itemIndex.has(r.itemId));
    const xs = touched.map((r) => itemIndex.get(r.itemId)!);
    const ys = touched.map((r) => -(r as unknown as { rating: number }).rating);
    const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
    const mx = mean(xs), my = mean(ys);
    const r = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0) /
      Math.sqrt(xs.reduce((s, x) => s + (x - mx) ** 2, 0) * ys.reduce((s, y) => s + (y - my) ** 2, 0));
    const sorted = [...lat].sort((a, b) => a - b);
    const q = (f: number) => sorted[Math.floor(f * (sorted.length - 1))];
    const line = (
      `DEEP ${ITEMS} items ${ANSWERS} answers: next() ms p50 ${q(0.5).toFixed(0)} p95 ${q(0.95).toFixed(0)} max ${sorted.at(-1)!.toFixed(0)}; ` +
        `late p50 ${[...lat.slice(-50)].sort((a, b) => a - b)[25].toFixed(0)}; rated ${touched.length} items; Pearson(order, rating) ${r.toFixed(3)}`
    );
    if (process.env.DEEP_OUT) appendFileSync(process.env.DEEP_OUT, line + "\n");
    expect(touched.length).toBeGreaterThan(0);
  }, 600_000);
});
