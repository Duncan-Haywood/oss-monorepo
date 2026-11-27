// Quote follow-up (services/quotes/follow-ups.ts): the first follow-up day set at send from the
// shop's setting, the quote log's due list, logging a follow-up with the next day (or none), the
// daily email once per due day to the quote's author, and every read and write kept to its shop.
import { env } from "cloudflare:workers";
import type {
  FollowUpQueueDto,
  QuoteDetailDto,
  QuoteFollowUpEmailsDto,
  QuoteFollowUpsDto,
} from "@shared/api";
import type { CostInputs } from "@shared/costing";
import { nextWeekday } from "@shared/follow-up";
import { addDays } from "@shared/time-zone";
import { createAppContext, testFakes } from "@worker/context";
import { quotes } from "@worker/db/schema";
import type { Env } from "@worker/env";
import { remindFollowUps } from "@worker/services/quotes/follow-ups";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { addMember, api, json, seedRateCard, setupTenant, testDb } from "./helpers";

type Tenant = Awaited<ReturnType<typeof setupTenant>>;

async function sentQuote(t: Tenant, as: string, customerCompany = "Acme") {
  const rates = await seedRateCard(t);
  const inputs: Partial<CostInputs> = {
    quantities: [10],
    customerSuppliedMaterial: true,
    material: null,
    operations: [
      { machineId: rates.mill, label: "OP10 mill", setupMinutes: 60, cycleMinutesPerPart: 12 },
    ],
  };
  const q = await json<QuoteDetailDto>(
    api(t.path("/quotes"), {
      method: "POST",
      as,
      json: { customerCompany, customerContact: "Sam Lee", customerEmail: "sam@acme.example" },
    }),
    201,
  );
  await json(
    api(t.path(`/quotes/${q.id}/lines`), {
      method: "POST",
      as,
      json: { partNumber: "BRK-1", revision: "A", inputs },
    }),
    201,
  );
  return json<QuoteDetailDto>(api(t.path(`/quotes/${q.id}/send`), { method: "POST", as }));
}

/** Server time is real time in these tests; the test shops have no time zone (UTC). */
const today = () => new Date().toISOString().slice(0, 10);
const setDates = (id: string, set: { followUpOn?: string | null; validUntil?: string | null }) =>
  testDb().update(quotes).set(set).where(eq(quotes.id, id));
const run = (iso: string) =>
  remindFollowUps(createAppContext(env as unknown as Env, { now: () => new Date(iso) }));
const mailTo = (userId: string) =>
  testFakes.email.sent.filter((m) => m.to.includes(`${userId}@example.test`));

beforeEach(() => {
  testFakes.email.sent.length = 0;
});

describe("quote follow-up", () => {
  it("sets the first follow-up day at send from the shop's setting; admins change it", async () => {
    const t = await setupTenant();
    const est = await addMember(t.orgId, "estimator");
    const a = await sentQuote(t, est);
    expect(a.followUpOn).toBe(nextWeekday(addDays(today(), 3)));

    // Estimators cannot change the shop's setting; admins can, within 0..60.
    const put = (as: string, followUpDays: unknown) =>
      api(t.path("/quotes/follow-ups/settings"), { method: "PUT", as, json: { followUpDays } });
    expect((await put(est, 5)).status).toBe(403);
    expect((await put(t.userId, 61)).status).toBe(400);
    expect((await put(t.userId, 1.5)).status).toBe(400);
    await json(put(t.userId, 7));
    const b = await sentQuote(t, est);
    expect(b.followUpOn).toBe(nextWeekday(addDays(today(), 7)));
    await json(put(t.userId, 0));
    const c = await sentQuote(t, est);
    expect(c.followUpOn).toBeNull();
    const queue = await json<FollowUpQueueDto>(api(t.path("/quotes/follow-ups"), { as: est }));
    expect(queue.followUpDays).toBe(0);
  });

  it("lists due quotes oldest first and the coming week, and drops decided ones", async () => {
    const t = await setupTenant();
    const a = await sentQuote(t, t.userId, "Acme");
    const b = await sentQuote(t, t.userId, "Beta Robotics");
    const soon = await sentQuote(t, t.userId, "Soon Inc");
    const far = await sentQuote(t, t.userId, "Far Ltd");
    const won = await sentQuote(t, t.userId, "Won Co");
    await setDates(a.id, { followUpOn: addDays(today(), -1) });
    await setDates(b.id, { followUpOn: addDays(today(), -4) });
    await setDates(soon.id, { followUpOn: addDays(today(), 2) });
    await setDates(far.id, { followUpOn: addDays(today(), 20) });
    await setDates(won.id, { followUpOn: addDays(today(), -2) });
    await json(
      api(t.path(`/quotes/${won.id}/outcome`), {
        method: "POST",
        as: t.userId,
        json: { outcome: "won", poNumber: "PO-1", wonAmountCents: 1000 },
      }),
    );

    const viewer = await addMember(t.orgId, "viewer");
    const queue = await json<FollowUpQueueDto>(api(t.path("/quotes/follow-ups"), { as: viewer }));
    expect(queue.today).toBe(today());
    expect(queue.due.map((i) => i.customerCompany)).toEqual(["Beta Robotics", "Acme"]);
    expect(queue.upcoming.map((i) => i.customerCompany)).toEqual(["Soon Inc"]);
    expect(queue.due[0]?.estimatorName).toBe("Test User");
    expect(queue.due[0]?.count).toBe(0);
    expect(queue.truncated).toBe(false);
  });

  it("logs a follow-up with the next day or none, and refuses what makes no sense", async () => {
    const t = await setupTenant();
    const est = await addMember(t.orgId, "estimator");
    const viewer = await addMember(t.orgId, "viewer");
    const q = await sentQuote(t, est);
    await setDates(q.id, { followUpOn: addDays(today(), -1) });
    const log = (as: string, body: unknown) =>
      api(t.path(`/quotes/${q.id}/follow-ups`), { method: "POST", as, json: body });

    expect((await log(viewer, { note: "x", nextOn: null })).status).toBe(403);
    expect((await log(est, { note: "x", nextOn: today() })).status).toBe(400);
    expect((await log(est, { note: "x", nextOn: "2031-02-30" })).status).toBe(400);
    expect((await log(est, { note: "x", nextOn: addDays(today(), 181) })).status).toBe(400);
    // An empty note that keeps the same day logs nothing.
    expect((await log(est, { note: "  ", nextOn: addDays(today(), -1) })).status).toBe(400);

    const next = addDays(today(), 7);
    const after = await json<QuoteFollowUpsDto>(
      log(est, { note: "  Left a voicemail\r\nwith Sam  ", nextOn: next }),
      201,
    );
    expect(after.followUpOn).toBe(next);
    expect(after.entries).toHaveLength(1);
    expect(after.entries[0]?.note).toBe("Left a voicemail\nwith Sam");
    expect(after.entries[0]?.nextOn).toBe(next);
    expect(after.entries[0]?.day).toBe(today());

    // A new day with no note is a snooze and is logged.
    const snoozed = await json<QuoteFollowUpsDto>(
      log(est, { note: "", nextOn: addDays(today(), 3) }),
      201,
    );
    expect(snoozed.entries).toHaveLength(2);
    expect(snoozed.entries[0]?.note).toBeNull();

    // Off the list once its day is in the future; the queue carries the last note and the count.
    let queue = await json<FollowUpQueueDto>(api(t.path("/quotes/follow-ups"), { as: est }));
    expect(queue.due).toHaveLength(0);
    expect(queue.upcoming[0]?.count).toBe(2);
    expect(queue.upcoming[0]?.lastNote).toBeNull();

    const done = await json<QuoteFollowUpsDto>(
      log(est, { note: "Buyer will decide next month; stop chasing", nextOn: null }),
      201,
    );
    expect(done.followUpOn).toBeNull();
    queue = await json<FollowUpQueueDto>(api(t.path("/quotes/follow-ups"), { as: est }));
    expect(queue.upcoming).toHaveLength(0);

    // A decided quote takes no more follow-ups, and its log is still readable.
    await json(
      api(t.path(`/quotes/${q.id}/outcome`), {
        method: "POST",
        as: est,
        json: { outcome: "lost", reason: "price" },
      }),
    );
    expect((await log(est, { note: "late", nextOn: null })).status).toBe(409);
    const read = await json<QuoteFollowUpsDto>(
      api(t.path(`/quotes/${q.id}/follow-ups`), { as: viewer }),
    );
    expect(read.status).toBe("lost");
    expect(read.followUpOn).toBeNull();
    expect(read.entries).toHaveLength(3);
  });

  it("keeps another shop's quotes, logs and settings out of reach", async () => {
    const a = await setupTenant();
    const b = await setupTenant();
    const q = await sentQuote(a, a.userId, "Secret Customer");
    await setDates(q.id, { followUpOn: addDays(today(), -1) });
    // B's member, on A's paths: not a member there.
    expect((await api(a.path("/quotes/follow-ups"), { as: b.userId })).status).toBe(404);
    // B's own paths with A's quote id: not found.
    expect((await api(b.path(`/quotes/${q.id}/follow-ups`), { as: b.userId })).status).toBe(404);
    const post = await api(b.path(`/quotes/${q.id}/follow-ups`), {
      method: "POST",
      as: b.userId,
      json: { note: "x", nextOn: null },
    });
    expect(post.status).toBe(404);
    const bQueue = await json<FollowUpQueueDto>(
      api(b.path("/quotes/follow-ups"), { as: b.userId }),
    );
    expect(bQueue.due).toHaveLength(0);
    await json(
      api(b.path("/quotes/follow-ups/settings"), {
        method: "PUT",
        as: b.userId,
        json: { followUpDays: 0 },
      }),
    );
    const aQueue = await json<FollowUpQueueDto>(
      api(a.path("/quotes/follow-ups"), { as: a.userId }),
    );
    expect(aQueue.followUpDays).toBe(3);
    expect(aQueue.due.map((i) => i.customerCompany)).toEqual(["Secret Customer"]);
  });
});

describe("follow-up emails", () => {
  it("mails each estimator their own due quotes once per due day", async () => {
    const t = await setupTenant();
    const est = await addMember(t.orgId, "estimator");
    const a = await sentQuote(t, est, "Acme");
    const b = await sentQuote(t, est, "Beta Robotics");
    const notYet = await sentQuote(t, est, "Later Inc");
    const expiring = await sentQuote(t, est, "Expiring Co");
    const ownerQuote = await sentQuote(t, t.userId, "Owner Co");
    await setDates(a.id, { followUpOn: "2031-04-10", validUntil: "2031-05-30" });
    await setDates(b.id, { followUpOn: "2031-04-07", validUntil: "2031-05-30" });
    await setDates(notYet.id, { followUpOn: "2031-04-11", validUntil: "2031-05-30" });
    // Expires tomorrow: the expiry email names it, so this one does not.
    await setDates(expiring.id, { followUpOn: "2031-04-08", validUntil: "2031-04-11" });
    await setDates(ownerQuote.id, { followUpOn: "2031-04-09", validUntil: "2031-05-30" });

    const r = await run("2031-04-10T11:17:00Z");
    expect(r.emails).toBeGreaterThanOrEqual(2);
    const mine = mailTo(est);
    expect(mine).toHaveLength(1);
    expect(mine[0]?.subject).toBe("2 quotes to follow up on");
    const text = mine[0]?.text ?? "";
    expect(text.indexOf("Beta Robotics")).toBeLessThan(text.indexOf("for Acme"));
    expect(text).toContain("3 days overdue");
    expect(text).toContain("due today");
    expect(text).toContain(`/app/${t.orgId}/quotes/${a.id}`);
    expect(text).not.toContain(notYet.id);
    expect(text).not.toContain(expiring.id);
    expect(text).not.toContain(ownerQuote.id);
    expect(mailTo(t.userId)[0]?.subject).toBe(
      `Follow up on Q-${ownerQuote.quoteNumber} for Owner Co`,
    );

    // The same day again: nothing new. Next day: only the quote whose day just came.
    await run("2031-04-10T18:00:00Z");
    expect(mailTo(est)).toHaveLength(1);
    await run("2031-04-11T11:17:00Z");
    expect(mailTo(est)).toHaveLength(2);
    expect(mailTo(est)[1]?.subject).toBe(`Follow up on Q-${notYet.quoteNumber} for Later Inc`);

    // A logged follow-up that sets a new day is mailed again when that day comes.
    await setDates(a.id, { followUpOn: "2031-04-14" });
    await run("2031-04-13T11:17:00Z");
    expect(mailTo(est)).toHaveLength(2);
    await run("2031-04-14T11:17:00Z");
    expect(mailTo(est)).toHaveLength(3);
    expect(mailTo(est)[2]?.text).toContain(a.id);
  });

  it("skips members who turned it off and quotes that were decided", async () => {
    const t = await setupTenant();
    const off = await addMember(t.orgId, "estimator");
    const q = await sentQuote(t, off);
    const won = await sentQuote(t, t.userId);
    await setDates(q.id, { followUpOn: "2031-06-01", validUntil: "2031-07-01" });
    await setDates(won.id, { followUpOn: "2031-06-01", validUntil: "2031-07-01" });
    await testDb().update(quotes).set({ status: "won" }).where(eq(quotes.id, won.id));

    const get = await json<QuoteFollowUpEmailsDto>(
      api(t.path("/notifications/quote-follow-up"), { as: off }),
    );
    expect(get.quoteFollowUp).toBe(true);
    await json(
      api(t.path("/notifications/quote-follow-up"), {
        method: "PUT",
        as: off,
        json: { quoteFollowUp: false },
      }),
    );
    const r = await run("2031-06-02T11:17:00Z");
    expect(r.skipped).toBeGreaterThanOrEqual(1);
    expect(mailTo(off)).toHaveLength(0);
    expect(mailTo(t.userId)).toHaveLength(0);
  });
});
