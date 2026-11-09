/**
 * Several respondents with noisy and slot-biased answers, through the real
 * next/answer routes and Postgres (2026-11-01).
 *
 * `deepBudget.integration.test.ts` used one noiseless respondent. This asks
 * the two things that test left open (docs/INFORMATION-GAIN-SELECTOR.md):
 *   1. With a lapse rate (a random answer instead of the true one) and with
 *      slot bias (always the top option, with some probability), does the
 *      ranking the route stores still follow the hidden order?
 *   2. Does the first-option fallback in the route fire for a person who
 *      really favours the top slot, and stay quiet for one who does not?
 *      (The route shuffles which slot an item lands in, so an unbiased person
 *      sits near a 0.5 share.)
 *
 * Hidden order: lower sortOrder wins. Rank quality is Spearman between the
 * order and the stored rating over every item the respondent rated.
 * Needs a database: `scripts/test-db.sh start`. NOISY_OUT=file appends the line.
 * NOISY_ITEMS, NOISY_ANSWERS and NOISY_RESPONDENTS override 60, 200 and 3;
 * NOISY_TIMEOUT_MS overrides the 15-minute test timeout (3000 answers needs more).
 * NOISY_CONDITIONS (comma list of condition names) runs only those, and
 * NOISY_CHECKPOINTS (comma list of answer counts, default none) also reports
 * Spearman and the number of rated items along each respondent's own run
 * (2026-11-04, to explain why 3000 answers scored below 1000: docs), plus the
 * Spearman over the items rated at the first checkpoint (the fixed set).
 * NOISY_SELECTOR=standard runs the shipped selector instead of the staged one
 * (2026-11-05, to tell the selector from the rating update: docs).
 */
import { appendFileSync } from "fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => import("@/test/integration/cookieMock"));

// Control for the first-option fallback (2026-11-02): when `fallbackOff.on` is
// set the staged selector is called without the person's first-option share,
// so it never falls back to the shipped selector. Everything else is real.
const fallbackOff = vi.hoisted(() => ({ on: false }));
vi.mock("@/lib/pairing", async () => {
  const actual = await vi.importActual<typeof import("@/lib/pairing")>("@/lib/pairing");
  return {
    ...actual,
    selectNextPairHybrid: (input: Parameters<typeof actual.selectNextPairHybrid>[0], o?: Parameters<typeof actual.selectNextPairHybrid>[1]) =>
      actual.selectNextPairHybrid(fallbackOff.on ? { ...input, firstOptionShare: undefined } : input, o),
  };
});

import { prisma } from "@/lib/prisma";
import { jsonRequest, resetData } from "@/test/integration/db";
import { POST as nextQuestion } from "@/app/api/trials/next/route";
import { POST as answer } from "@/app/api/trials/answer/route";

const SLUG = "noisy-respondents";
const ITEMS = Number(process.env.NOISY_ITEMS ?? 60);
const ANSWERS = Number(process.env.NOISY_ANSWERS ?? 200);
const RESPONDENTS = Number(process.env.NOISY_RESPONDENTS ?? 3);

function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32);
}
function ranks(a: number[]) {
  const idx = a.map((v, i) => [v, i]).sort((x, y) => x[0] - y[0]);
  const r = new Array<number>(a.length);
  idx.forEach(([, i], k) => (r[i] = k));
  return r;
}
function pearson(xs: number[], ys: number[]) {
  const m = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
  const mx = m(xs), my = m(ys);
  return xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0) /
    Math.sqrt(xs.reduce((s, x) => s + (x - mx) ** 2, 0) * ys.reduce((s, y) => s + (y - my) ** 2, 0));
}

const ONLY = process.env.NOISY_CONDITIONS?.split(",");
const CHECKPOINTS = (process.env.NOISY_CHECKPOINTS ?? "").split(",").filter(Boolean).map(Number);
const ALL_CONDITIONS: { name: string; lapse: number; lapseFrom?: number; bias: number; off: boolean }[] = [
  { name: "clean", lapse: 0, bias: 0, off: false },
  { name: "lapse20", lapse: 0.2, bias: 0, off: false },
  // Fatigue (2026-11-09): no lapses for the first 2000 answers, then 50% lapses.
  { name: "lapselate", lapse: 0.5, lapseFrom: 2000, bias: 0, off: false },
  { name: "bias50", lapse: 0, bias: 0.5, off: false },
  { name: "bias80", lapse: 0, bias: 0.8, off: false },
  // Controls: the same biased people with the fallback switched off.
  { name: "bias50-nofallback", lapse: 0, bias: 0.5, off: true },
  { name: "bias80-nofallback", lapse: 0, bias: 0.8, off: true },
];
const CONDITIONS = ONLY ? ALL_CONDITIONS.filter((c) => ONLY.includes(c.name)) : ALL_CONDITIONS;

describe("noisy and biased respondents through the route", () => {
  beforeAll(async () => {
    await resetData();
    await prisma.survey.deleteMany({ where: { slug: SLUG } });
    await prisma.survey.create({
      data: {
        slug: SLUG,
        title: "Noisy respondents",
        pairSelector: process.env.NOISY_SELECTOR === "standard" ? "standard" : "staged",
        items: { create: Array.from({ length: ITEMS }, (_, i) => ({ slug: `i${i}`, label: `Item ${i}`, sortOrder: i })) },
      },
    });
  });
  afterAll(async () => {
    await resetData();
    await prisma.survey.deleteMany({ where: { slug: SLUG } });
  });

  it("keeps rank quality and fires the fallback only for a biased respondent", async () => {
    const survey = await prisma.survey.findUniqueOrThrow({ where: { slug: SLUG } });
    const order = new Map((await prisma.item.findMany({ where: { surveyId: survey.id } })).map((it) => [it.id, it.sortOrder]));
    const lines: string[] = [];
    const out: Record<string, { rho: number; share: number }> = {};
    const spearmanNow = async (participantId: string) => {
      const rows = await prisma.participantItemRating.findMany({ where: { participantId } });
      const xs = rows.map((r) => order.get(r.itemId)!);
      const ys = rows.map((r) => -(r as unknown as { rating: number }).rating);
      return { rho: pearson(ranks(xs), ranks(ys)), rated: rows.length };
    };
    // Fixed-set score (2026-11-04): the items rated at the first checkpoint,
    // scored again at every later one, so the set does not widen underneath.
    const fixedNow = async (participantId: string, fixed: Set<string>) => {
      const rows = (await prisma.participantItemRating.findMany({ where: { participantId } })).filter((r) => fixed.has(r.itemId));
      const xs = rows.map((r) => order.get(r.itemId)!);
      const ys = rows.map((r) => -(r as unknown as { rating: number }).rating);
      return pearson(ranks(xs), ranks(ys));
    };

    for (const c of CONDITIONS) {
      fallbackOff.on = c.off;
      let rhoSum = 0, shareSum = 0;
      for (let k = 0; k < RESPONDENTS; k++) {
        const rand = rng(1000 + k * 17 + c.name.replace("-nofallback", "").length);
        const p = await prisma.participant.create({ data: { surveyId: survey.id, firstName: `${c.name}${k}`, perspective: "PARTNER" } });
        let topPicks = 0;
        let fixedSet: Set<string> | null = null;
        for (let i = 0; i < ANSWERS; i++) {
          const q = await (await nextQuestion(jsonRequest("http://localhost/api/trials/next", { participantId: p.id }))).json();
          const truth = order.get(q.itemA.id)! < order.get(q.itemB.id)! ? "A" : "B";
          const result = rand() < c.bias ? "A" : rand() < (i >= (c.lapseFrom ?? 0) ? c.lapse : 0) ? (rand() < 0.5 ? "A" : "B") : truth;
          if (result === "A") topPicks++;
          await answer(jsonRequest("http://localhost/api/trials/answer", { trialId: q.trialId, result }));
          if (CHECKPOINTS.includes(i + 1)) {
            const c2 = await spearmanNow(p.id);
            if (!fixedSet) {
              fixedSet = new Set((await prisma.participantItemRating.findMany({ where: { participantId: p.id } })).map((r) => r.itemId));
            }
            const fx = await fixedNow(p.id, fixedSet);
            lines.push(`${c.name} respondent ${k} @${i + 1}: Spearman ${c2.rho.toFixed(3)}, rated ${c2.rated}, fixed-set (${fixedSet.size}) ${fx.toFixed(3)}`);
          }
        }
        const rows = await prisma.participantItemRating.findMany({ where: { participantId: p.id } });
        const xs = rows.map((r) => order.get(r.itemId)!);
        const ys = rows.map((r) => -(r as unknown as { rating: number }).rating);
        rhoSum += pearson(ranks(xs), ranks(ys));
        shareSum += topPicks / ANSWERS;
      }
      out[c.name] = { rho: rhoSum / RESPONDENTS, share: shareSum / RESPONDENTS };
      lines.push(`${c.name}: Spearman ${out[c.name].rho.toFixed(3)}, top-slot share ${out[c.name].share.toFixed(2)}`);
    }
    const line = `NOISY ${ITEMS} items, ${RESPONDENTS} respondents x ${ANSWERS} answers per condition: ${lines.join("; ")}`;
    if (process.env.NOISY_OUT) appendFileSync(process.env.NOISY_OUT, line + "\n");
    console.log(line);
    // Floors set well under the measured values; they catch a broken route, not a ranking-quality claim.
    if (out.clean) {
      expect(out.clean.rho).toBeGreaterThan(0.5);
      expect(out.clean.share).toBeGreaterThan(0.4);
      expect(out.clean.share).toBeLessThan(0.6);
    }
    if (out.bias80) expect(out.bias80.share).toBeGreaterThan(0.8);
  }, Number(process.env.NOISY_TIMEOUT_MS ?? 900_000));
});
