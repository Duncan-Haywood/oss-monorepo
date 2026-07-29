/**
 * The two free-text write routes: `/api/feedback` and `/api/report`.
 *
 * `docs/ROUTES.md` listed both as `session` in the Auth column and "account
 * required" in the Limit column, and ranked them below the admin portal on
 * the strength of that. Neither is true of the code: both call
 * `getSessionUser()`, both accept `null`, and both write the row either way.
 * They are anonymous write endpoints, and the table's own rule is that a
 * `none` row with an empty Limit is a bug being introduced.
 *
 * Being anonymous is the right design — the feedback widget is shown to
 * someone answering signed out, and a person who hits a bug before making an
 * account is exactly who needs to be able to report it. What was missing is
 * the bound that every other anonymous write on this app already has.
 *
 * `/api/report` did have a guard. It counted recent rows matching the
 * caller's own `userAgent` and `path`, so a caller who varied the user-agent
 * string was never counted at all. That is the one test here that fails
 * against the old code rather than describing behaviour that was already
 * right.
 *
 * Needs a database: `scripts/test-db.sh start`, then `npm run test:integration`.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => import("@/test/integration/cookieMock"));

import { prisma } from "@/lib/prisma";
import { createAccount, jsonRequest, resetData, signInAs, signOut } from "@/test/integration/db";

import { POST as feedback } from "./route";
import { POST as report } from "../report/route";

function feedbackRequest(body: unknown, headers: Record<string, string> = {}) {
  return jsonRequest("http://localhost/api/feedback", body, { "x-forwarded-for": "10.0.0.1", ...headers });
}

function reportRequest(body: unknown, headers: Record<string, string> = {}) {
  return jsonRequest("http://localhost/api/report", body, { "x-forwarded-for": "10.0.0.1", ...headers });
}

beforeEach(async () => {
  await resetData();
  signOut();
});

describe("feedback", () => {
  it("records a note from someone with no account", async () => {
    expect((await feedback(feedbackRequest({
      subject: "top-pick",
      usefulness: 1,
      reason: "too_vague",
      note: "loved the idea, needed specifics",
      answerCount: 42,
      perspective: "SELF",
      path: "/insights",
    }))).status).toBe(200);
    const rows = await prisma.insightFeedback.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0].userId).toBeNull();
    expect(rows[0]).toMatchObject({
      reason: "too_vague",
      note: "loved the idea, needed specifics",
      answerCount: 42,
      perspective: "SELF",
      path: "/insights",
    });
  });

  it("rejects unknown context values instead of storing arbitrary categories", async () => {
    await feedback(feedbackRequest({
      subject: "top-pick",
      usefulness: 1,
      reason: "drop_table",
      perspective: "NOT_A_MODE",
      path: "https://elsewhere.example",
    }));
    expect(await prisma.insightFeedback.findFirstOrThrow()).toMatchObject({
      reason: null,
      perspective: null,
      path: null,
    });
  });

  it("attributes it to the account when there is one", async () => {
    const user = await createAccount();
    await signInAs(user.id);
    await feedback(feedbackRequest({ subject: "session", usefulness: 4 }));
    expect((await prisma.insightFeedback.findFirstOrThrow()).userId).toBe(user.id);
  });

  it("needs a subject and something to record", async () => {
    expect((await feedback(feedbackRequest({ note: "hi" }))).status).toBe(400);
    expect((await feedback(feedbackRequest({ subject: "session" }))).status).toBe(400);
    expect((await feedback(feedbackRequest({ subject: "session", note: "   " }))).status).toBe(400);
    expect(await prisma.insightFeedback.count()).toBe(0);
  });

  it("clamps a rating into 1..5 instead of storing what it was sent", async () => {
    await feedback(feedbackRequest({ subject: "a", usefulness: 99, enjoyment: -4 }));
    const row = await prisma.insightFeedback.findFirstOrThrow();
    expect(row.usefulness).toBe(5);
    expect(row.enjoyment).toBe(1);
  });

  it("bounds an anonymous caller", async () => {
    // The gap: 1000 characters of free text per row, no account, no limit.
    for (let i = 0; i < 60; i++) {
      expect((await feedback(feedbackRequest({ subject: "s", note: `n${i}` }, { "x-forwarded-for": "10.1.1.1" }))).status).toBe(200);
    }
    const res = await feedback(feedbackRequest({ subject: "s", note: "one too many" }, { "x-forwarded-for": "10.1.1.1" }));
    expect(res.status).toBe(429);
    expect(await prisma.insightFeedback.count()).toBe(60);
  });

  it("bounds the calling IP only", async () => {
    for (let i = 0; i < 60; i++) {
      await feedback(feedbackRequest({ subject: "s", note: `n${i}` }, { "x-forwarded-for": "10.1.1.2" }));
    }
    expect((await feedback(feedbackRequest({ subject: "s", note: "x" }, { "x-forwarded-for": "10.1.1.3" }))).status).toBe(200);
  });

  it("exempts an account from the anonymous limit", async () => {
    const user = await createAccount();
    await signInAs(user.id);
    for (let i = 0; i < 65; i++) {
      expect((await feedback(feedbackRequest({ subject: "s", note: `n${i}` }, { "x-forwarded-for": "10.1.1.4" }))).status).toBe(200);
    }
    // And nothing was written to the anonymous ledger on their behalf.
    expect(await prisma.anonRequestLog.count({ where: { route: "feedback" } })).toBe(0);
  });
});

describe("report", () => {
  it("records a bug report from someone with no account", async () => {
    const res = await report(reportRequest({
      kind: "question",
      impact: "hard",
      perspective: "SELF",
      message: "the wording felt loaded",
      path: "/app",
    }));
    expect(res.status).toBe(200);
    expect((await res.json()).reference).toMatch(/^[A-Z0-9]{8}$/);
    const rows = await prisma.userReport.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0].userId).toBeNull();
    expect(rows[0]).toMatchObject({ kind: "question", impact: "hard", perspective: "SELF" });
    expect(rows[0].resolved).toBe(false);
  });

  it("falls back to 'other' for a kind it does not know", async () => {
    await report(reportRequest({ kind: "'; drop table", message: "x" }));
    expect((await prisma.userReport.findFirstOrThrow()).kind).toBe("other");
  });

  it("needs a message", async () => {
    expect((await report(reportRequest({ kind: "bug" }))).status).toBe(400);
    expect((await report(reportRequest({ kind: "bug", message: "  " }))).status).toBe(400);
    expect(await prisma.userReport.count()).toBe(0);
  });

  it("validates reply addresses and discards unrecognised context", async () => {
    expect((await report(reportRequest({ kind: "idea", message: "x", email: "not-an-email" }))).status).toBe(400);
    expect(await prisma.userReport.count()).toBe(0);

    await report(reportRequest({
      kind: "made-up",
      impact: "catastrophic",
      perspective: "NOT_A_MODE",
      message: "x",
      path: "https://evil.example",
    }));
    expect(await prisma.userReport.findFirstOrThrow()).toMatchObject({
      kind: "other",
      impact: null,
      perspective: null,
      path: null,
    });
  });

  it("falls back to the account's email when none is given", async () => {
    const user = await createAccount("someone@example.com");
    await signInAs(user.id);
    await report(reportRequest({ kind: "idea", message: "x" }));
    expect((await prisma.userReport.findFirstOrThrow()).email).toBe("someone@example.com");
  });

  it("bounds an anonymous caller", async () => {
    for (let i = 0; i < 10; i++) {
      expect((await report(reportRequest({ kind: "bug", message: `m${i}` }, { "x-forwarded-for": "10.2.2.1" }))).status).toBe(200);
    }
    expect((await report(reportRequest({ kind: "bug", message: "again" }, { "x-forwarded-for": "10.2.2.1" }))).status).toBe(429);
    expect(await prisma.userReport.count()).toBe(10);
  });

  it("still bounds a caller who changes their user-agent every time", async () => {
    // The regression. The old limit counted rows matching the caller's own
    // `userAgent` AND `path`, both taken straight from the request, so this
    // loop wrote 30 rows without ever reaching the limit — the guard whose
    // comment said "per IP" could be stepped around by editing a header.
    for (let i = 0; i < 10; i++) {
      await report(reportRequest(
        { kind: "bug", message: `m${i}`, path: `/p${i}` },
        { "x-forwarded-for": "10.2.2.2", "user-agent": `Mozilla/5.0 (build ${i})` }
      ));
    }
    const res = await report(reportRequest(
      { kind: "bug", message: "one more", path: "/p999" },
      { "x-forwarded-for": "10.2.2.2", "user-agent": "Mozilla/5.0 (build 999)" }
    ));
    expect(res.status).toBe(429);
    expect(await prisma.userReport.count()).toBe(10);
  });

  it("exempts an account from the anonymous limit", async () => {
    const user = await createAccount();
    await signInAs(user.id);
    for (let i = 0; i < 15; i++) {
      expect((await report(reportRequest({ kind: "bug", message: `m${i}` }, { "x-forwarded-for": "10.2.2.3" }))).status).toBe(200);
    }
    expect(await prisma.anonRequestLog.count({ where: { route: "report" } })).toBe(0);
  });

  it("keeps the two routes' budgets separate", async () => {
    // One ledger table, two routes: spending the report budget must not
    // silence the feedback widget for the same person.
    for (let i = 0; i < 10; i++) {
      await report(reportRequest({ kind: "bug", message: `m${i}` }, { "x-forwarded-for": "10.2.2.4" }));
    }
    expect((await report(reportRequest({ kind: "bug", message: "x" }, { "x-forwarded-for": "10.2.2.4" }))).status).toBe(429);
    expect((await feedback(feedbackRequest({ subject: "s", note: "x" }, { "x-forwarded-for": "10.2.2.4" }))).status).toBe(200);
  });
});
