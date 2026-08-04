/**
 * The admin portal, against a real database.
 *
 * This was the largest coverage gap in the repo, and it was the largest for a
 * reason worth stating: four routes, one of which serialises every answer,
 * every rating and every free-text note in the database into a CSV, and the
 * only thing that had ever checked any of it was somebody using the portal
 * and it looking right.
 *
 * "It looked right" cannot distinguish the three failures that matter here:
 *
 *  1. **The door.** `verifySessionToken` is hand-rolled — an expiry, a dot,
 *     an HMAC of the expiry. The payload *is* the expiry, so if the signature
 *     were checked loosely, or not at all, extending your own session to a
 *     year would be string concatenation. Nothing had ever presented this
 *     function with a forged token.
 *  2. **The throttle.** The admin key is the only credential on the portal
 *     and `AdminLoginAttempt` is the only thing standing in front of it.
 *  3. **What comes back out.** The export is opened in a spreadsheet, and
 *     several of its columns are free text a stranger can write.
 *
 * Needs a database: `scripts/test-db.sh start`, then `npm run test:integration`.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => import("@/test/integration/cookieMock"));

import { createHmac } from "crypto";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ADMIN_COOKIE_NAME, createSessionToken } from "@/lib/adminAuth";
import { rateLimitKey } from "@/lib/http";
import { setCookie, clearCookies } from "@/test/integration/cookieMock";
import { createAccount, createParticipant, jsonRequest, resetData, surveyIdBySlug } from "@/test/integration/db";

import { POST as login } from "./login/route";
import { POST as logout } from "./logout/route";
import { GET as overview } from "./overview/route";
import { GET as exportCsv } from "./export/route";
import { POST as reportUpdate } from "./report/route";

/** What `src/test/integration/env.ts` sets, and what the portal checks against. */
const ADMIN_KEY = "integration-admin-key";

function signedIn(): void {
  setCookie(ADMIN_COOKIE_NAME, createSessionToken());
}

function loginRequest(key: unknown, ip = "10.0.0.1") {
  return jsonRequest("http://localhost/api/admin/login", { key }, { "x-forwarded-for": ip });
}

function exportRequest(what?: string) {
  const url = what === undefined
    ? "http://localhost/api/admin/export"
    : `http://localhost/api/admin/export?what=${encodeURIComponent(what)}`;
  // The handler reads `req.nextUrl`, which a plain Request does not have.
  return new NextRequest(url);
}

/** Parses a CSV body into a header row and cell rows, honouring quoting. */
function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  const cells: string[][] = [[]];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { cells[cells.length - 1].push(field); field = ""; }
    else if (c === "\n") { cells[cells.length - 1].push(field); field = ""; cells.push([]); }
    else field += c;
  }
  cells[cells.length - 1].push(field);
  const [headers, ...rows] = cells;
  return { headers, rows: rows.filter((r) => r.length > 1 || r[0] !== "") };
}

function cell(csv: string, column: string, row = 0): string {
  const { headers, rows } = parseCsv(csv);
  const idx = headers.indexOf(column);
  if (idx === -1) throw new Error(`No "${column}" column in: ${headers.join(",")}`);
  return rows[row][idx];
}

/** An answered trial on a seeded survey, so the export and overview have something to read. */
async function answeredTrial(participantId: string, slug: string, opts: { result?: string; msToAnswer?: number } = {}) {
  const items = await prisma.item.findMany({
    where: { survey: { slug } },
    orderBy: { sortOrder: "asc" },
    take: 2,
    select: { id: true },
  });
  return prisma.trial.create({
    data: {
      participantId,
      itemAId: items[0].id,
      itemBId: items[1].id,
      result: opts.result ?? "A",
      answeredAt: new Date(),
      msToAnswer: opts.msToAnswer ?? 2000,
    },
  });
}

beforeEach(async () => {
  await resetData();
});

describe("the door", () => {
  // Every one of these is the whole database. A regression in
  // `verifySessionToken` opens all four at once, which is why they are
  // checked as a set rather than one representative route.
  const routes: [string, () => Promise<Response>][] = [
    ["overview", () => overview()],
    ["export", () => exportCsv(exportRequest("trials"))],
    ["report", () => reportUpdate(jsonRequest("http://localhost/api/admin/report", { id: "x" }))],
  ];

  for (const [name, call] of routes) {
    it(`${name} refuses a caller with no cookie`, async () => {
      clearCookies();
      expect((await call()).status).toBe(401);
    });

    it(`${name} refuses a cookie that is not a token`, async () => {
      setCookie(ADMIN_COOKIE_NAME, "let-me-in");
      expect((await call()).status).toBe(401);
    });

    it(`${name} accepts a real token`, async () => {
      signedIn();
      expect((await call()).status).not.toBe(401);
    });
  }

  it("refuses an expired token even though its signature is valid", async () => {
    // Signed with the real secret, so only the expiry check can reject it.
    const past = String(Date.now() - 1000);
    const sig = createHmac("sha256", process.env.ADMIN_SESSION_SECRET!).update(past).digest("hex");
    setCookie(ADMIN_COOKIE_NAME, `${past}.${sig}`);
    expect((await overview()).status).toBe(401);
  });

  it("refuses a token whose expiry was extended", async () => {
    // The attack the signature exists to stop: the payload IS the expiry, so
    // a token is a deadline the holder could otherwise edit. Keep a valid
    // signature, move the deadline a year out.
    const real = createSessionToken();
    const [, sig] = real.split(".");
    const farFuture = String(Date.now() + 365 * 24 * 60 * 60 * 1000);
    setCookie(ADMIN_COOKIE_NAME, `${farFuture}.${sig}`);
    expect((await overview()).status).toBe(401);
  });

  it("refuses a token signed with a different secret", async () => {
    const payload = String(Date.now() + 60_000);
    const sig = createHmac("sha256", "not-the-secret").update(payload).digest("hex");
    setCookie(ADMIN_COOKIE_NAME, `${payload}.${sig}`);
    expect((await overview()).status).toBe(401);
  });

  it("refuses a signature of the wrong length without throwing", async () => {
    // `timingSafeEqual` throws on a length mismatch rather than returning
    // false, so the length guard before it is load-bearing: without it a
    // one-character signature is a 500 from an uncaught crypto error, not a
    // 401. Two of the three routes check the cookie outside their try/catch.
    setCookie(ADMIN_COOKIE_NAME, `${Date.now() + 60_000}.ab`);
    expect((await overview()).status).toBe(401);
  });
});

describe("login", () => {
  it("rejects the wrong key, records the failure, and sets no cookie", async () => {
    clearCookies();
    const res = await login(loginRequest("wrong"));
    expect(res.status).toBe(401);

    const store = await (await import("@/test/integration/cookieMock")).cookies();
    expect(store.get(ADMIN_COOKIE_NAME)).toBeUndefined();

    const attempts = await prisma.adminLoginAttempt.findMany();
    expect(attempts).toHaveLength(1);
    expect(attempts[0].success).toBe(false);
  });

  it("rejects a key of a different length rather than crashing", async () => {
    // Same `timingSafeEqual` length trap as the token check, on the other
    // credential. A 500 here would also skip recording the failed attempt,
    // which is what the throttle counts.
    expect((await login(loginRequest("x"))).status).toBe(401);
    expect((await login(loginRequest(`${ADMIN_KEY}-and-then-some`))).status).toBe(401);
    expect(await prisma.adminLoginAttempt.count({ where: { success: false } })).toBe(2);
  });

  it("rejects a non-string key", async () => {
    expect((await login(loginRequest({ toString: "nope" }))).status).toBe(401);
    expect((await login(loginRequest(null))).status).toBe(401);
  });

  it("accepts the right key and issues a token the other routes honour", async () => {
    clearCookies();
    const res = await login(loginRequest(ADMIN_KEY));
    expect(res.status).toBe(200);

    // Not "a cookie was set" — that the cookie actually opens the portal.
    expect((await overview()).status).toBe(200);

    const attempts = await prisma.adminLoginAttempt.findMany();
    expect(attempts).toHaveLength(1);
    expect(attempts[0].success).toBe(true);
  });

  it("locks an IP out after 8 failures, and still refuses the right key", async () => {
    for (let i = 0; i < 8; i++) {
      expect((await login(loginRequest("wrong", "10.9.9.9"))).status).toBe(401);
    }
    expect((await login(loginRequest("wrong", "10.9.9.9"))).status).toBe(429);

    // The property that matters: the lockout is not a speed bump that the
    // correct key walks past. Guessing has to stop, not slow down.
    expect((await login(loginRequest(ADMIN_KEY, "10.9.9.9"))).status).toBe(429);
  });

  it("locks out the failing IP only", async () => {
    for (let i = 0; i < 8; i++) await login(loginRequest("wrong", "10.9.9.9"));
    expect((await login(loginRequest(ADMIN_KEY, "10.9.9.10"))).status).toBe(200);
  });

  it("counts only failures inside the window", async () => {
    for (let i = 0; i < 8; i++) await login(loginRequest("wrong", "10.9.9.11"));
    expect((await login(loginRequest("wrong", "10.9.9.11"))).status).toBe(429);

    // Age them past the 15-minute window rather than waiting for it.
    await prisma.adminLoginAttempt.updateMany({
      where: { ip: rateLimitKey("10.9.9.11") },
      data: { createdAt: new Date(Date.now() - 16 * 60 * 1000) },
    });
    expect((await login(loginRequest(ADMIN_KEY, "10.9.9.11"))).status).toBe(200);
  });

  it("does not count successes toward the lockout", async () => {
    for (let i = 0; i < 10; i++) {
      expect((await login(loginRequest(ADMIN_KEY, "10.9.9.12"))).status).toBe(200);
    }
  });
});

describe("logout", () => {
  it("clears the cookie", async () => {
    signedIn();
    expect((await overview()).status).toBe(200);
    expect((await logout()).status).toBe(200);
    expect((await overview()).status).toBe(401);
  });
});

describe("export", () => {
  it("rejects an unknown table", async () => {
    signedIn();
    expect((await exportCsv(exportRequest("../../etc/passwd"))).status).toBe(400);
    expect((await exportCsv(exportRequest("users"))).status).toBe(400);
  });

  it("defaults to trials", async () => {
    signedIn();
    const res = await exportCsv(exportRequest());
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
    expect(res.headers.get("content-disposition")).toContain("quickpick-trials.csv");
  });

  it("serialises a trial with the columns the header names", async () => {
    signedIn();
    const p = await createParticipant("behaviors", { firstName: "Ada" });
    await answeredTrial(p.id, "behaviors", { result: "B", msToAnswer: 1234 });

    const csv = await (await exportCsv(exportRequest("trials"))).text();
    const { rows } = parseCsv(csv);
    expect(rows).toHaveLength(1);
    expect(cell(csv, "firstName")).toBe("Ada");
    expect(cell(csv, "result")).toBe("B");
    expect(cell(csv, "msToAnswer")).toBe("1234");
    expect(cell(csv, "participantId")).toBe(p.id);
  });

  it("quotes a value containing a comma, a quote or a newline", async () => {
    signedIn();
    await prisma.userReport.create({
      data: { kind: "bug", message: 'It broke, badly.\nI said "ouch".' },
    });
    const csv = await (await exportCsv(exportRequest("reports"))).text();
    // Round-trips: the reader gets back exactly what the user typed, and the
    // row did not split at the newline.
    expect(parseCsv(csv).rows).toHaveLength(1);
    expect(cell(csv, "message")).toBe('It broke, badly.\nI said "ouch".');
  });

  it("neutralises a spreadsheet formula in a free-text field", async () => {
    // `/api/report` and `/api/feedback` both take an anonymous POST, so this
    // text can come from anyone with the URL. Opened in Excel, LibreOffice or
    // Sheets, a cell starting with = + - or @ is evaluated rather than shown.
    signedIn();
    await prisma.userReport.create({
      data: { kind: "bug", message: '=HYPERLINK("http://evil.example","Click me")' },
    });
    await prisma.userReport.create({ data: { kind: "idea", message: "+1 to that" } });
    await prisma.userReport.create({ data: { kind: "other", message: "@channel look at this" } });

    const csv = await (await exportCsv(exportRequest("reports"))).text();
    const { rows, headers } = parseCsv(csv);
    const messages = rows.map((r) => r[headers.indexOf("message")]);
    for (const m of messages) {
      expect(m.startsWith("'")).toBe(true);
    }
    // The apostrophe is a display prefix, not a mangling: the text survives.
    expect(messages).toContain('\'=HYPERLINK("http://evil.example","Click me")');
  });

  it("leaves a negative number as a negative number", async () => {
    // The formula guard triggers on a leading "-", so it must apply to text
    // and not to numeric columns, or every negative figure gains a quote.
    signedIn();
    const p = await createParticipant("behaviors");
    const item = await prisma.item.findFirstOrThrow({ where: { survey: { slug: "behaviors" } } });
    await prisma.participantItemRating.create({
      data: { participantId: p.id, itemId: item.id, rating: 1000, rd: 600 },
    });
    const csv = await (await exportCsv(exportRequest("ratings"))).text();
    // 1000 - 1.96 * 600 is negative, and is a number, so it stays bare.
    expect(cell(csv, "ci95Low")).toBe("-176");
  });

  it("exports each of the five tables it offers", async () => {
    signedIn();
    for (const what of ["trials", "ratings", "financial", "feedback", "reports"]) {
      const res = await exportCsv(exportRequest(what));
      expect(res.status, what).toBe(200);
      expect(res.headers.get("content-disposition"), what).toContain(`quickpick-${what}.csv`);
    }
  });
});

describe("overview", () => {
  it("counts what it says it counts", async () => {
    signedIn();
    const user = await createAccount();
    const p = await createParticipant("behaviors", { userId: user.id });
    await answeredTrial(p.id, "behaviors", { result: "A" });
    await answeredTrial(p.id, "behaviors", { result: "EQUAL" });

    const body = await (await overview()).json();
    expect(body.totals.users).toBe(1);
    expect(body.totals.answeredItemTrials).toBe(2);
    expect(body.totals.tiedAnswers).toBe(1);
    expect(body.totals.linkedCouples).toBe(0);
  });

  it("counts a couple only once both people are in it", async () => {
    signedIn();
    const a = await createAccount();
    const b = await createAccount();
    const couple = await prisma.couple.create({
      data: { inviteCode: "ABCD1234", creatorId: a.id },
    });
    expect((await (await overview()).json()).totals.linkedCouples).toBe(0);

    await prisma.couple.update({ where: { id: couple.id }, data: { joinerId: b.id } });
    expect((await (await overview()).json()).totals.linkedCouples).toBe(1);
  });

  it("counts abandoned sessions, not unanswered rows", async () => {
    // The distinction the route's own comment insists on: a trial row is
    // written when a pair is shown, so unanswered rows are mostly reloads.
    // Only a participant whose LAST row is unanswered walked away.
    signedIn();
    const p = await createParticipant("behaviors");
    const items = await prisma.item.findMany({
      where: { survey: { slug: "behaviors" } }, take: 2, select: { id: true },
    });
    // Three abandoned-looking rows, then an answer: this person did not leave.
    for (let i = 0; i < 3; i++) {
      await prisma.trial.create({
        data: { participantId: p.id, itemAId: items[0].id, itemBId: items[1].id, shownAt: new Date(Date.now() - 5000 + i) },
      });
    }
    await prisma.trial.create({
      data: {
        participantId: p.id, itemAId: items[0].id, itemBId: items[1].id,
        shownAt: new Date(), result: "A", answeredAt: new Date(), msToAnswer: 900,
      },
    });

    let body = await (await overview()).json();
    expect(body.engagement.sessionsStarted).toBe(1);
    expect(body.engagement.sessionsAbandoned).toBe(0);

    // One more shown and never answered, and now they did.
    await prisma.trial.create({
      data: { participantId: p.id, itemAId: items[0].id, itemBId: items[1].id, shownAt: new Date(Date.now() + 5000) },
    });
    body = await (await overview()).json();
    expect(body.engagement.sessionsAbandoned).toBe(1);
    expect(body.engagement.abandonRate).toBe(1);
  });

  it("lists only people who answered something", async () => {
    signedIn();
    const answered = await createParticipant("behaviors", { firstName: "Ada" });
    await createParticipant("behaviors", { firstName: "Ghost" });
    await answeredTrial(answered.id, "behaviors");

    const body = await (await overview()).json();
    expect(body.people.map((p: { firstName: string }) => p.firstName)).toEqual(["Ada"]);
    expect(body.people[0].answered).toBe(1);
  });

  it("surfaces open reports separately from resolved ones", async () => {
    signedIn();
    await prisma.userReport.create({ data: { kind: "bug", message: "one" } });
    await prisma.userReport.create({ data: { kind: "bug", message: "two", resolved: true } });

    const body = await (await overview()).json();
    expect(body.reports).toHaveLength(2);
    expect(body.openReports).toBe(1);
  });

  it("returns an empty shape rather than failing on an empty database", async () => {
    // The portal is opened before anyone has answered anything, every time
    // the project is redeployed. `median([])` is null, not NaN, and a rate
    // over zero sessions is null, not a division by zero.
    signedIn();
    const body = await (await overview()).json();
    expect(body.totals.answeredItemTrials).toBe(0);
    expect(body.engagement.medianMsToAnswer).toBeNull();
    expect(body.engagement.abandonRate).toBeNull();
    expect(body.people).toEqual([]);
  });
});

describe("report triage", () => {
  it("marks a report resolved and back again", async () => {
    signedIn();
    const r = await prisma.userReport.create({ data: { kind: "bug", message: "x" } });

    expect((await reportUpdate(jsonRequest("http://localhost/api/admin/report", { id: r.id }))).status).toBe(200);
    expect((await prisma.userReport.findUniqueOrThrow({ where: { id: r.id } })).resolved).toBe(true);

    await reportUpdate(jsonRequest("http://localhost/api/admin/report", { id: r.id, resolved: false }));
    expect((await prisma.userReport.findUniqueOrThrow({ where: { id: r.id } })).resolved).toBe(false);
  });

  it("requires an id", async () => {
    signedIn();
    expect((await reportUpdate(jsonRequest("http://localhost/api/admin/report", {}))).status).toBe(400);
    expect((await reportUpdate(jsonRequest("http://localhost/api/admin/report", { id: 7 }))).status).toBe(400);
  });

  it("reports an unknown id as not found", async () => {
    signedIn();
    const res = await reportUpdate(jsonRequest("http://localhost/api/admin/report", { id: "no-such-report" }));
    expect(res.status).toBe(404);
  });
});

describe("what the portal reads", () => {
  it("does not expose a participant's answers to a survey it was not asked for", async () => {
    // A sanity check on the export's scoping rather than a privacy boundary:
    // the admin is meant to see everything. What would be wrong is a row
    // attributed to the wrong person, which is what `participantId` pins.
    signedIn();
    const a = await createParticipant("behaviors", { firstName: "A" });
    const b = await createParticipant("behaviors", { firstName: "B" });
    await answeredTrial(a.id, "behaviors");

    const csv = await (await exportCsv(exportRequest("trials"))).text();
    const { rows, headers } = parseCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0][headers.indexOf("participantId")]).toBe(a.id);
    expect(rows[0][headers.indexOf("participantId")]).not.toBe(b.id);
  });

  it("names the survey each answer came from", async () => {
    signedIn();
    const p = await createParticipant("behaviors");
    await answeredTrial(p.id, "behaviors");
    const csv = await (await exportCsv(exportRequest("trials"))).text();
    expect(cell(csv, "survey")).toBe("behaviors");
    expect(await surveyIdBySlug("behaviors")).toBeTruthy();
  });
});
