// Following up on a sent quote by email (services/quotes/email.ts `emailFollowUp`): the form's
// prefills, the message threaded on the quote email, the PDF attached again on request, the
// follow-up logged with the next day once it is sent, and the same limits, roles and tenancy as
// the quote email.
import type {
  FollowUpEmailFormDto,
  FollowUpEmailResultDto,
  QuoteDetailDto,
  QuoteEmailDto,
  QuoteEmailsDto,
} from "@shared/api";
import type { CostInputs } from "@shared/costing";
import { QUOTE_EMAIL_LIMITS } from "@shared/quote-email";
import { addDays } from "@shared/time-zone";
import { testFakes } from "@worker/context";
import { quotes, rfqs } from "@worker/db/schema";
import { newId } from "@worker/lib/ids";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { addMember, api, json, seedRateCard, setupTenant, testDb } from "./helpers";

type Tenant = Awaited<ReturnType<typeof setupTenant>>;

async function sentQuote(t: Tenant) {
  const rates = await seedRateCard(t);
  const inputs: Partial<CostInputs> = {
    quantities: [10],
    customerSuppliedMaterial: true,
    material: null,
    operations: [
      { machineId: rates.mill, label: "OP10 mill", setupMinutes: 30, cycleMinutesPerPart: 6 },
    ],
  };
  const q = await json<QuoteDetailDto>(
    api(t.path("/quotes"), {
      method: "POST",
      as: t.userId,
      json: { customerCompany: "Example Robotics LLC" },
    }),
    201,
  );
  await json(
    api(t.path(`/quotes/${q.id}`), {
      method: "PATCH",
      as: t.userId,
      json: { customerContact: "Sam Buyer", customerEmail: "sam@robotics.example" },
    }),
  );
  await json(
    api(t.path(`/quotes/${q.id}/lines`), {
      method: "POST",
      as: t.userId,
      json: { partNumber: "BRK-1001", inputs },
    }),
    201,
  );
  return json<QuoteDetailDto>(
    api(t.path(`/quotes/${q.id}/send`), { method: "POST", as: t.userId }),
  );
}

const today = () => new Date().toISOString().slice(0, 10);
const form = (t: Tenant, id: string, as = t.userId) =>
  json<FollowUpEmailFormDto>(api(t.path(`/quotes/${id}/follow-up-email`), { as }));
const followUp = (t: Tenant, id: string, body: Record<string, unknown>, as = t.userId) =>
  api(t.path(`/quotes/${id}/follow-up-email`), {
    method: "POST",
    as,
    json: { to: "sam@robotics.example", message: "Any questions?", nextOn: null, ...body },
  });

beforeEach(() => {
  testFakes.email.sent.length = 0;
});

describe("follow-up email", () => {
  it("prefills a drafted message to the quote's customer", async () => {
    const t = await setupTenant();
    const q = await sentQuote(t);
    const f = await form(t, q.id);
    expect(f).toMatchObject({
      canDeliver: false,
      defaultTo: "sam@robotics.example",
      subject: `Following up: Quote Q-${q.quoteNumber} from Test Shop`,
      threaded: false,
      replyTo: `${t.userId}@example.test`,
      followUpEmails: 0,
    });
    expect(f.defaultMessage).toContain(
      `Hello Sam Buyer,\n\nI'm following up on our quote Q-${q.quoteNumber}, sent on ${today()}.`,
    );
  });

  it("goes as a reply to the quote email, with the PDF again, and logs the follow-up", async () => {
    const t = await setupTenant();
    const q = await sentQuote(t);
    await json<QuoteEmailDto>(
      api(t.path(`/quotes/${q.id}/email`), {
        method: "POST",
        as: t.userId,
        json: { to: "sam@robotics.example, eng@robotics.example", message: "Quote attached" },
      }),
      201,
    );
    const f = await form(t, q.id);
    expect(f.defaultTo).toBe("sam@robotics.example, eng@robotics.example");
    expect(f.subject).toBe(`Re: Quote Q-${q.quoteNumber} from Test Shop`);
    expect(f.threaded).toBe(true);

    const next = addDays(today(), 7);
    const res = await json<FollowUpEmailResultDto>(
      followUp(t, q.id, {
        to: f.defaultTo,
        message: "Hi Sam, any questions on the brackets?",
        attachPdf: true,
        note: "Second try; buyer was out",
        nextOn: next,
      }),
      201,
    );
    expect(res.email).toMatchObject({
      kind: "follow_up",
      status: "sent",
      subject: `Re: Quote Q-${q.quoteNumber} from Test Shop`,
      to: ["sam@robotics.example", "eng@robotics.example"],
    });
    const [quoteMail, fu] = testFakes.email.sent;
    // The quote email's id from the (fake) provider is what the follow-up replies to.
    expect(fu?.headers).toEqual({
      "In-Reply-To": "<fake-email-1@fake.invalid>",
      References: "<fake-email-1@fake.invalid>",
    });
    expect(fu?.replyTo).toBe(`${t.userId}@example.test`);
    expect(fu?.text.startsWith("Hi Sam, any questions on the brackets?\n\n--\n")).toBe(true);
    expect(fu?.text).toContain(`Attached again: Q-${q.quoteNumber}.pdf.`);
    expect(fu?.attachments?.[0]?.content).toBe(quoteMail?.attachments?.[0]?.content);

    // Logged on the quote with the next day, so the due list moves on.
    expect(res.followUps.followUpOn).toBe(next);
    expect(res.followUps.entries[0]?.note).toBe(
      "Emailed a follow-up to sam@robotics.example, eng@robotics.example.\nSecond try; buyer was out",
    );
    expect(res.followUps.entries[0]?.nextOn).toBe(next);

    // Both emails in the quote's history; the next form says "again" and threads on both.
    const history = await json<QuoteEmailsDto>(
      api(t.path(`/quotes/${q.id}/emails`), { as: t.userId }),
    );
    expect(history.items.map((e) => e.kind)).toEqual(["follow_up", "quote"]);
    const again = await form(t, q.id);
    expect(again.followUpEmails).toBe(1);
    expect(again.defaultMessage).toContain("checking in again");
    await json(followUp(t, q.id, { nextOn: addDays(today(), 3) }), 201);
    expect(testFakes.email.sent[2]?.headers).toEqual({
      "In-Reply-To": "<fake-email-2@fake.invalid>",
      References: "<fake-email-1@fake.invalid> <fake-email-2@fake.invalid>",
    });
  });

  it("without the PDF there is no attachment; 'no more' clears the day", async () => {
    const t = await setupTenant();
    const q = await sentQuote(t);
    const res = await json<FollowUpEmailResultDto>(followUp(t, q.id, { nextOn: null }), 201);
    const msg = testFakes.email.sent[0];
    expect(msg?.attachments).toBeUndefined();
    expect(msg?.headers).toBeUndefined();
    expect(msg?.subject).toBe(`Following up: Quote Q-${q.quoteNumber} from Test Shop`);
    expect(res.followUps.followUpOn).toBeNull();
    const row = await testDb().select().from(quotes).where(eq(quotes.id, q.id)).get();
    expect(row?.followUpOn).toBeNull();
  });

  it("stays in the RFQ's thread when the quote came in by email", async () => {
    const t = await setupTenant();
    const q = await sentQuote(t);
    const rfqId = newId("rfq");
    await testDb().insert(rfqs).values({
      id: rfqId,
      orgId: t.orgId,
      source: "email",
      subject: "RFQ - brackets",
      fromAddress: "sam@robotics.example",
      messageId: "<rfq1@robotics.example>",
      bodyText: "Please quote.",
    });
    await testDb().update(quotes).set({ rfqId }).where(eq(quotes.id, q.id));
    await json(followUp(t, q.id, {}), 201);
    expect(testFakes.email.sent[0]?.headers).toEqual({
      "In-Reply-To": "<rfq1@robotics.example>",
      References: "<rfq1@robotics.example>",
    });
  });

  it("refuses drafts, closed quotes, bad input and viewers, and logs nothing", async () => {
    const t = await setupTenant();
    const q = await sentQuote(t);
    expect((await followUp(t, q.id, { to: "not an address" })).status).toBe(400);
    expect((await followUp(t, q.id, { message: "   " })).status).toBe(400);
    expect((await followUp(t, q.id, { nextOn: today() })).status).toBe(400);
    expect((await followUp(t, q.id, { nextOn: addDays(today(), 181) })).status).toBe(400);
    const viewer = await addMember(t.orgId, "viewer");
    expect((await followUp(t, q.id, {}, viewer)).status).toBe(403);
    await testDb().update(quotes).set({ status: "lost" }).where(eq(quotes.id, q.id));
    expect((await followUp(t, q.id, {})).status).toBe(409);
    expect(testFakes.email.sent).toHaveLength(0);
    const log = await json<{ entries: unknown[] }>(
      api(t.path(`/quotes/${q.id}/follow-ups`), { as: t.userId }),
    );
    expect(log.entries).toHaveLength(0);
  });

  it("shares the quote email's per-quote limit", async () => {
    const t = await setupTenant();
    const q = await sentQuote(t);
    for (let i = 0; i < QUOTE_EMAIL_LIMITS.perQuotePerDay; i++) {
      await json(followUp(t, q.id, { nextOn: addDays(today(), 3) }), 201);
    }
    expect((await followUp(t, q.id, {})).status).toBe(429);
  });

  it("never reaches another shop's quote", async () => {
    const a = await setupTenant();
    const b = await setupTenant();
    const q = await sentQuote(a);
    expect((await followUp(b, q.id, {})).status).toBe(404);
    expect((await api(b.path(`/quotes/${q.id}/follow-up-email`), { as: b.userId })).status).toBe(
      404,
    );
    expect(testFakes.email.sent).toHaveLength(0);
  });
});
