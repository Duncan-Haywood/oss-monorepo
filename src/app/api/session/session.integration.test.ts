/**
 * Starting and resuming a session, against a real database.
 *
 * Two things here are only true at the database level and were previously
 * checked by hand: that a signed-in account *reuses* its participants when it
 * switches perspective (the profile screen promises that answers already given
 * are still there, and creating a fresh row silently reset every progress bar
 * to zero), and that the anonymous rate limit actually counts rows.
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

import { POST as start } from "./start/route";
import { POST as status } from "./status/route";

function startSession(body: unknown, headers: Record<string, string> = {}) {
  return start(jsonRequest("http://localhost/api/session/start", body, headers));
}

describe("POST /api/session/start", () => {
  beforeEach(async () => {
    await resetData();
  });

  it("creates one participant per survey and returns them by slug", async () => {
    const res = await startSession({ firstName: "Ada" });
    expect(res.status).toBe(200);
    const body = await res.json();

    const surveys = await prisma.survey.count();
    expect(Object.keys(body.participants)).toHaveLength(surveys);
    expect(await prisma.participant.count()).toBe(surveys);
    expect(body.perspective).toBe("PARTNER");
  });

  it("keeps a signed-in account's answers when it switches perspective and back", async () => {
    const user = await createAccount();
    await signInAs(user.id);

    const first = await (await startSession({ firstName: "Ada", perspective: "PARTNER" })).json();
    const guess = await (await startSession({ firstName: "Ada", perspective: "PARTNER_GUESS" })).json();
    const back = await (await startSession({ firstName: "Ada", perspective: "PARTNER" })).json();

    // A different framing is a different ranking, so it gets its own rows...
    expect(guess.participants.values).not.toBe(first.participants.values);
    // ...but coming back has to land on the answers already given.
    expect(back.participants).toEqual(first.participants);

    const surveys = await prisma.survey.count();
    expect(await prisma.participant.count()).toBe(surveys * 2);
  });

  it("refuses the personal fields the intro form used to collect", async () => {
    const res = await startSession({
      firstName: "Ada",
      lastName: "Lovelace",
      email: "ada@example.com",
      sex: "F",
      age: 36,
      ethnicity: "…",
      countryOfResidence: "UK",
    });
    expect(res.status).toBe(200);

    // Not "parsed and ignored" — an unauthenticated endpoint that accepts
    // special-category data is the thing being prevented, so nothing may land.
    const participants = await prisma.participant.findMany();
    expect(participants.length).toBeGreaterThan(0);
    for (const p of participants) {
      expect([p.lastName, p.email, p.sex, p.age, p.ethnicity, p.countryOfResidence]).toEqual([
        null,
        null,
        null,
        null,
        null,
        null,
      ]);
    }
  });

  it("throttles anonymous starts per IP, and exempts a signed-in account", async () => {
    const ip = "203.0.113.7";
    const headers = { "x-forwarded-for": ip };

    // Fill the window directly rather than by making forty real calls: the
    // limit is a count of AnonRequestLog rows, and that is what is under test.
    await prisma.anonRequestLog.createMany({
      data: Array.from({ length: 40 }, () => ({ ip, route: "session/start" })),
    });

    const blocked = await startSession({ firstName: "Ada" }, headers);
    expect(blocked.status).toBe(429);

    const user = await createAccount();
    await signInAs(user.id);
    const allowed = await startSession({ firstName: "Ada" }, headers);
    expect(allowed.status).toBe(200);
    signOut();

    // A different network is unaffected — the limit is per IP, not global.
    const elsewhere = await startSession({ firstName: "Bo" }, { "x-forwarded-for": "198.51.100.4" });
    expect(elsewhere.status).toBe(200);
  });

  it("requires a first name", async () => {
    expect((await startSession({})).status).toBe(400);
    expect((await startSession({ firstName: "   " })).status).toBe(400);
    expect(await prisma.participant.count()).toBe(0);
  });
});

describe("POST /api/session/status", () => {
  beforeEach(async () => {
    await resetData();
  });

  it("reports progress per domain without creating a trial row", async () => {
    const started = await (await startSession({ firstName: "Ada" })).json();

    const res = await status(
      jsonRequest("http://localhost/api/session/status", { participants: started.participants })
    );
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.status.values).toEqual({ confidence: expect.any(Number), answeredCount: 0 });
    // This is the read-only path the resume screen uses; if it created rows
    // it would inflate the abandonment metric on every page load.
    expect(await prisma.trial.count()).toBe(0);
  });

  it("caps the fan-out no matter how large a map it is handed", async () => {
    const participants: Record<string, string> = {};
    for (let i = 0; i < 25; i++) {
      const p = await createParticipant("values", { firstName: `P${i}` });
      participants[`s${i}`] = p.id;
    }

    const res = await status(jsonRequest("http://localhost/api/session/status", { participants }));
    expect(res.status).toBe(200);
    const body = await res.json();
    // 25 real ids in, at most 20 queried: a 5 MB body cannot fan out into
    // hundreds of thousands of concurrent queries.
    expect(Object.keys(body.status)).toHaveLength(20);
  });

  it("rejects a body with no participants map", async () => {
    const res = await status(jsonRequest("http://localhost/api/session/status", { participants: [] }));
    expect(res.status).toBe(400);
  });
});
