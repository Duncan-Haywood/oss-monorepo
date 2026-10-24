/**
 * The admin ranking route, against a real database.
 *
 * `groupRanking` and `coverage` are unit-tested on arrays; this checks the
 * route that feeds them: the door (401 without a session, 404 for an unknown
 * slug), the query that pools every respondent's ratings, the median answers
 * per person read from answered trials, and the CSV.
 *
 * Respondents answer through the real next/answer routes with a hidden
 * preference order (items listed first win), so the ranking can be checked
 * against a ground truth rather than against itself.
 *
 * Needs a database: `scripts/test-db.sh start`, then `npm run test:integration`.
 */

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => import("@/test/integration/cookieMock"));

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ADMIN_COOKIE_NAME, createSessionToken } from "@/lib/adminAuth";
import { setCookie, clearCookies } from "@/test/integration/cookieMock";
import { createParticipant, jsonRequest, resetData } from "@/test/integration/db";

import { POST as nextQuestion } from "@/app/api/trials/next/route";
import { POST as answer } from "@/app/api/trials/answer/route";
import { GET as ranking } from "./[slug]/ranking/route";

const SURVEY = "values";
const RESPONDENTS = 6;
const ANSWERS_EACH = 40;

function get(slug: string, query = "") {
  return ranking(new NextRequest(`http://localhost/api/admin/surveys/${slug}/ranking${query}`), { params: Promise.resolve({ slug }) });
}

describe("admin survey ranking", () => {
  let order: Map<string, number>; // item id -> true position, 0 = best

  beforeAll(async () => {
    await prisma.$connect();
  });

  beforeEach(async () => {
    await resetData();
    clearCookies();
    const items = await prisma.item.findMany({ where: { survey: { slug: SURVEY } }, orderBy: { sortOrder: "asc" }, select: { id: true } });
    order = new Map(items.map((it, i) => [it.id, i]));
  });

  async function runRespondents(n: number, answers: number) {
    for (let k = 0; k < n; k++) {
      const p = await createParticipant(SURVEY);
      for (let i = 0; i < answers; i++) {
        const res = await nextQuestion(jsonRequest("http://localhost/api/trials/next", { participantId: p.id }));
        const q = await res.json();
        const a = order.get(q.itemA.id)!, b = order.get(q.itemB.id)!;
        await answer(jsonRequest("http://localhost/api/trials/answer", { trialId: q.trialId, result: a < b ? "A" : "B" }));
      }
    }
  }

  it("refuses without an admin session and 404s an unknown survey", async () => {
    expect((await get(SURVEY)).status).toBe(401);
    setCookie(ADMIN_COOKIE_NAME, createSessionToken());
    expect((await get("no-such-survey")).status).toBe(404);
  });

  it("with no answers returns every option unranked-by-evidence and an empty coverage", async () => {
    setCookie(ADMIN_COOKIE_NAME, createSessionToken());
    const res = await get(SURVEY);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.participants).toBe(0);
    expect(body.coverage.status).toBe("empty");
  });

  it("pools respondents who share a hidden order into a ranking that follows it", async () => {
    await runRespondents(RESPONDENTS, ANSWERS_EACH);
    setCookie(ADMIN_COOKIE_NAME, createSessionToken());
    const res = await get(SURVEY);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.participants).toBe(RESPONDENTS);
    const ranked: { itemId: string; rank: number; respondents: number; low: number; high: number; rating: number }[] = body.ranking;
    expect(ranked.length).toBe(order.size);
    for (const r of ranked) {
      expect(r.low).toBeLessThanOrEqual(r.rating);
      expect(r.high).toBeGreaterThanOrEqual(r.rating);
    }
    // Spearman correlation with the hidden order: 6 people x 40 answers on 16 items is plenty.
    const n = ranked.length;
    const d2 = ranked.reduce((t, r, i) => t + (i - order.get(r.itemId)!) ** 2, 0);
    const rho = 1 - (6 * d2) / (n * (n * n - 1));
    expect(rho).toBeGreaterThan(0.8);
    // Every participant answered ANSWERS_EACH pairs, and the route reads that from answered trials.
    expect(body.coverage.options).toBe(n);
  });

  it("downloads the same ranking as CSV, one row per option", async () => {
    await runRespondents(2, 10);
    setCookie(ADMIN_COOKIE_NAME, createSessionToken());
    const res = await get(SURVEY, "?format=csv");
    expect(res.headers.get("content-type")).toMatch(/text\/csv/);
    expect(res.headers.get("content-disposition")).toContain(`${SURVEY}-ranking.csv`);
    const lines = (await res.text()).trim().split("\n");
    expect(lines[0]).toMatch(/^rank,item,/);
    expect(lines.length - 1).toBe(order.size);
  });
});
