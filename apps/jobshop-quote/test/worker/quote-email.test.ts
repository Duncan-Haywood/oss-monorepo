// Emailing a sent quote (services/quotes/email.ts): the frozen PDF attached and checked against its
// hash, replies to the estimator, history per quote, limits per shop and per quote, and never across
// shops or by a viewer.
import { env } from "cloudflare:workers";
import type { QuoteDetailDto, QuoteEmailDto, QuoteEmailsDto } from "@shared/api";
import type { CostInputs } from "@shared/costing";
import { QUOTE_EMAIL_LIMITS } from "@shared/quote-email";
import { testFakes } from "@worker/context";
import { quoteEmails, quotes, rfqs, user } from "@worker/db/schema";
import { newId } from "@worker/lib/ids";
import { senderMustBeVerified } from "@worker/services/quotes/email";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { addMember, api, json, seedRateCard, setupTenant, testDb } from "./helpers";

type Tenant = Awaited<ReturnType<typeof setupTenant>>;

async function draftQuote(t: Tenant) {
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
    api(t.path(`/quotes/${q.id}/lines`), {
      method: "POST",
      as: t.userId,
      json: { partNumber: "BRK-1001", inputs },
    }),
    201,
  );
  await json(
    api(t.path(`/quotes/${q.id}`), {
      method: "PATCH",
      as: t.userId,
      json: {
        customerContact: "Sam Buyer",
        customerEmail: "sam@robotics.example",
        coverNote: "Hi Sam, our quote is attached.",
      },
    }),
  );
  return q;
}

async function sentQuote(t: Tenant) {
  const q = await draftQuote(t);
  return json<QuoteDetailDto>(
    api(t.path(`/quotes/${q.id}/send`), { method: "POST", as: t.userId }),
  );
}

const emailIt = (t: Tenant, quoteId: string, body: unknown, as = t.userId) =>
  api(t.path(`/quotes/${quoteId}/email`), { method: "POST", as, json: body });

const pdfBytes = async (t: Tenant, quoteId: string) =>
  new Uint8Array(
    await (await api(t.path(`/quotes/${quoteId}/pdf`), { as: t.userId })).arrayBuffer(),
  );

beforeEach(() => {
  testFakes.email.sent.length = 0;
});

describe("emailing a sent quote", () => {
  it("prefills the form from the quote and the signed-in estimator", async () => {
    const t = await setupTenant();
    const q = await sentQuote(t);
    const form = await json<QuoteEmailsDto>(
      api(t.path(`/quotes/${q.id}/emails`), { as: t.userId }),
    );
    expect(form).toMatchObject({
      items: [],
      canDeliver: false,
      defaultTo: "sam@robotics.example",
      defaultMessage: "Hi Sam, our quote is attached.",
      replyTo: `${t.userId}@example.test`,
    });
  });

  it("sends the frozen PDF to the customer with replies to the estimator, and records it", async () => {
    const t = await setupTenant();
    const q = await sentQuote(t);
    const sent = await json<QuoteEmailDto>(
      emailIt(t, q.id, { to: "sam@robotics.example, eng@robotics.example", message: "Hi Sam" }),
      201,
    );
    expect(sent).toMatchObject({
      to: ["sam@robotics.example", "eng@robotics.example"],
      replyTo: `${t.userId}@example.test`,
      subject: `Quote Q-${q.quoteNumber} from Test Shop`,
      pdfSha256: q.sentPdfSha256,
      status: "sent",
      delivered: false,
      sentByName: "Test User",
    });

    expect(testFakes.email.sent).toHaveLength(1);
    const msg = testFakes.email.sent[0];
    expect(msg?.to).toEqual(["sam@robotics.example", "eng@robotics.example"]);
    expect(msg?.replyTo).toBe(`${t.userId}@example.test`);
    expect(msg?.fromName).toBe("Test Shop via Job Shop Quote");
    expect(msg?.text.startsWith("Hi Sam\n\n--\n")).toBe(true);
    expect(msg?.text).toContain(`Attached: Q-${q.quoteNumber}.pdf`);
    // The attachment is byte-for-byte the PDF stored when the quote was marked sent.
    const att = msg?.attachments?.[0];
    expect(att).toMatchObject({
      filename: `Q-${q.quoteNumber}.pdf`,
      contentType: "application/pdf",
    });
    const stored = await pdfBytes(t, q.id);
    const decoded = Uint8Array.from(atob(att?.content ?? ""), (c) => c.charCodeAt(0));
    expect(decoded).toEqual(stored);

    const history = await json<QuoteEmailsDto>(
      api(t.path(`/quotes/${q.id}/emails`), { as: t.userId }),
    );
    expect(history.items.map((e) => e.id)).toEqual([sent.id]);
  });

  it("refuses drafts and closed quotes, and bad recipients", async () => {
    const t = await setupTenant();
    const draft = await draftQuote(t);
    const r1 = await emailIt(t, draft.id, { to: "sam@robotics.example", message: "x" });
    expect(r1.status).toBe(409);

    const q = await sentQuote(t);
    const bad = await emailIt(t, q.id, {
      to: "sam@robotics.example\r\nBcc: x@evil.example",
      message: "x",
    });
    expect(bad.status).toBe(400);
    const none = await emailIt(t, q.id, { to: " ", message: "x" });
    expect(none.status).toBe(400);

    await json(
      api(t.path(`/quotes/${q.id}/outcome`), {
        method: "POST",
        as: t.userId,
        json: { outcome: "won", poNumber: "PO-1" },
      }),
    );
    const won = await emailIt(t, q.id, { to: "sam@robotics.example", message: "x" });
    expect(won.status).toBe(409);
    expect(testFakes.email.sent).toHaveLength(0);
  });

  it("refuses to send a PDF whose bytes no longer match the recorded hash", async () => {
    const t = await setupTenant();
    const q = await sentQuote(t);
    const row = await testDb().select().from(quotes).where(eq(quotes.id, q.id)).get();
    await env.FILES.put(row?.sentPdfKey ?? "", new TextEncoder().encode("%PDF-1.4 tampered"));
    const res = await emailIt(t, q.id, { to: "sam@robotics.example", message: "x" });
    expect(res.status).toBe(409);
    expect(testFakes.email.sent).toHaveLength(0);
  });

  it("needs an estimator with a confirmed address", async () => {
    const t = await setupTenant();
    const q = await sentQuote(t);
    const viewer = await addMember(t.orgId, "viewer");
    expect(
      (await emailIt(t, q.id, { to: "sam@robotics.example", message: "x" }, viewer)).status,
    ).toBe(403);
    // A viewer may read the history.
    await json(api(t.path(`/quotes/${q.id}/emails`), { as: viewer }));

    const estimator = await addMember(t.orgId, "estimator");
    await testDb().update(user).set({ emailVerified: false }).where(eq(user.id, estimator));
    const res = await emailIt(t, q.id, { to: "sam@robotics.example", message: "x" }, estimator);
    expect(res.status).toBe(403);
    expect(await res.text()).toContain("Confirm your email");
    expect(testFakes.email.sent).toHaveLength(0);
  });

  it("needs a confirmed sender wherever sign-up confirms addresses", () => {
    const env = (APP_ENV: string, APP_URL: string, FAKE_EXTERNALS = "false") =>
      senderMustBeVerified({ APP_ENV, APP_URL, FAKE_EXTERNALS });
    expect(env("production", "https://quotes.example")).toBe(true);
    expect(env("development", "http://localhost:5173")).toBe(true);
    // A fake-mail server on HTTPS still confirms at sign-up, so sending still needs it.
    expect(env("development", "https://staging.example", "true")).toBe(true);
    expect(env("production", "http://localhost:5199", "true")).toBe(true);
    expect(env("test", "http://localhost", "true")).toBe(true);
    // The plain-http offline demo and e2e: sign-up skips confirming, mail is only recorded.
    expect(env("development", "http://localhost:5199", "true")).toBe(false);
  });

  it("never reaches another shop's quote", async () => {
    const a = await setupTenant();
    const b = await setupTenant();
    const q = await sentQuote(a);
    // B's member addressing A's quote through B's own org path.
    expect((await emailIt(b, q.id, { to: "sam@robotics.example", message: "x" })).status).toBe(404);
    expect((await api(b.path(`/quotes/${q.id}/emails`), { as: b.userId })).status).toBe(404);
    // B's member addressing A's org directly.
    const direct = await api(`/api/orgs/${a.orgId}/quotes/${q.id}/email`, {
      method: "POST",
      as: b.userId,
      json: { to: "sam@robotics.example", message: "x" },
    });
    expect([403, 404]).toContain(direct.status);
    expect(testFakes.email.sent).toHaveLength(0);
  });

  it("limits sends per quote per day and per shop per hour", async () => {
    const t = await setupTenant();
    const q = await sentQuote(t);
    for (let i = 0; i < QUOTE_EMAIL_LIMITS.perQuotePerDay; i++) {
      await json(emailIt(t, q.id, { to: "sam@robotics.example", message: `try ${i}` }), 201);
    }
    const over = await emailIt(t, q.id, { to: "sam@robotics.example", message: "again" });
    expect(over.status).toBe(429);

    // Fill the shop's hour with rows on another quote of the same shop.
    const other = await sentQuote(t);
    const db = testDb();
    const now = new Date();
    for (let i = 0; i < QUOTE_EMAIL_LIMITS.perShopPerHour; i++) {
      await db.insert(quoteEmails).values({
        id: newId("qem"),
        orgId: t.orgId,
        quoteId: q.id,
        sentBy: t.userId,
        toAddresses: ["sam@robotics.example"],
        replyTo: "x@example.test",
        subject: "s",
        pdfSha256: "0",
        status: "sent",
        createdAt: now,
      });
    }
    const shopOver = await emailIt(t, other.id, { to: "sam@robotics.example", message: "x" });
    expect(shopOver.status).toBe(429);
    expect(testFakes.email.sent).toHaveLength(QUOTE_EMAIL_LIMITS.perQuotePerDay);
  });

  it("records a failed send and says nothing reached the customer", async () => {
    const t = await setupTenant();
    const q = await sentQuote(t);
    const original = testFakes.email.send.bind(testFakes.email);
    testFakes.email.send = async () => {
      throw new Error("Email send failed: E_RECIPIENT_SUPPRESSED sam@robotics.example");
    };
    try {
      const res = await emailIt(t, q.id, { to: "sam@robotics.example", message: "x" });
      expect(res.status).toBe(502);
    } finally {
      testFakes.email.send = original;
    }
    const history = await json<QuoteEmailsDto>(
      api(t.path(`/quotes/${q.id}/emails`), { as: t.userId }),
    );
    expect(history.items).toHaveLength(1);
    expect(history.items[0]).toMatchObject({ status: "failed" });
    expect(history.items[0]?.error).toContain("E_RECIPIENT_SUPPRESSED");
    expect(history.items[0]?.error).not.toContain("sam@robotics.example");
  });
});

describe("the shop signature and the estimator's copy", () => {
  it("puts the rate card's signature under the message and shows it on the form", async () => {
    const t = await setupTenant();
    const q = await sentQuote(t);
    await json(
      api(t.path("/settings"), {
        method: "PATCH",
        as: t.userId,
        json: { emailSignature: "Test Shop LLC\n\n12 Mill Rd\nAS9100D certified\n" },
      }),
    );
    const form = await json<QuoteEmailsDto>(
      api(t.path(`/quotes/${q.id}/emails`), { as: t.userId }),
    );
    expect(form.signature).toBe("Test Shop LLC\n12 Mill Rd\nAS9100D certified");
    await json(emailIt(t, q.id, { to: "sam@robotics.example", message: "Hi Sam" }), 201);
    const msg = testFakes.email.sent[0];
    expect(
      msg?.text.startsWith("Hi Sam\n\nTest Shop LLC\n12 Mill Rd\nAS9100D certified\n\n--\n"),
    ).toBe(true);
    expect(msg?.html).toContain("Test Shop LLC<br>12 Mill Rd<br>AS9100D certified");
  });

  it("sends the estimator a separate copy with the same PDF when asked, and records it", async () => {
    const t = await setupTenant();
    const q = await sentQuote(t);
    const sent = await json<QuoteEmailDto>(
      emailIt(t, q.id, { to: "sam@robotics.example", message: "Hi Sam", copyMe: true }),
      201,
    );
    expect(sent.senderCopy).toBe("sent");
    expect(testFakes.email.sent).toHaveLength(2);
    const [customer, copy] = testFakes.email.sent;
    expect(customer?.to).toEqual(["sam@robotics.example"]);
    expect(copy?.to).toEqual([`${t.userId}@example.test`]);
    expect(copy?.subject).toBe(`Copy: Quote Q-${q.quoteNumber} from Test Shop`);
    expect(
      copy?.text.startsWith("Your copy: this quote email was sent to sam@robotics.example."),
    ).toBe(true);
    expect(copy?.attachments?.[0]?.content).toBe(customer?.attachments?.[0]?.content);
    // The copy is not an attempt: it does not use up the per-quote allowance.
    const rows = await testDb()
      .select()
      .from(quoteEmails)
      .where(eq(quoteEmails.quoteId, q.id))
      .all();
    expect(rows).toHaveLength(1);

    // Without copyMe (or false) nothing extra goes out.
    testFakes.email.sent.length = 0;
    const plain = await json<QuoteEmailDto>(
      emailIt(t, q.id, { to: "sam@robotics.example", message: "Hi", copyMe: false }),
      201,
    );
    expect(plain.senderCopy).toBeNull();
    expect(testFakes.email.sent).toHaveLength(1);
  });

  it("a failed copy leaves the customer's send standing; a failed send gets no copy", async () => {
    const t = await setupTenant();
    const q = await sentQuote(t);
    const original = testFakes.email.send.bind(testFakes.email);
    let calls = 0;
    testFakes.email.send = async (m) => {
      calls += 1;
      if (calls === 2) throw new Error("Email send failed: mailbox full x@example.test");
      return original(m);
    };
    try {
      const sent = await json<QuoteEmailDto>(
        emailIt(t, q.id, { to: "sam@robotics.example", message: "Hi", copyMe: true }),
        201,
      );
      expect(sent).toMatchObject({ status: "sent", senderCopy: "failed" });

      calls = 0;
      testFakes.email.sent.length = 0;
      testFakes.email.send = async () => {
        calls += 1;
        throw new Error("Email send failed: down");
      };
      const res = await emailIt(t, q.id, {
        to: "sam@robotics.example",
        message: "x",
        copyMe: true,
      });
      expect(res.status).toBe(502);
      expect(calls).toBe(1);
    } finally {
      testFakes.email.send = original;
    }
  });

  it("refuses an unknown field and a signature over the limit", async () => {
    const t = await setupTenant();
    const q = await sentQuote(t);
    const res = await emailIt(t, q.id, {
      to: "sam@robotics.example",
      message: "x",
      cc: "a@b.example",
    });
    expect(res.status).toBe(400);
    const long = await api(t.path("/settings"), {
      method: "PATCH",
      as: t.userId,
      json: { emailSignature: "x".repeat(1001) },
    });
    expect(long.status).toBe(400);
  });
});

describe("threading the quote into the customer's RFQ email", () => {
  const MESSAGE_ID = "<CAB1x2y3@mail.robotics.example>";

  /** A sent quote made from an RFQ that sam@robotics.example emailed to the shop's address. */
  async function threadedQuote(t: Tenant, rfq: Partial<typeof rfqs.$inferInsert> = {}) {
    const q = await sentQuote(t);
    const rfqId = newId("rfq");
    await testDb()
      .insert(rfqs)
      .values({
        id: rfqId,
        orgId: t.orgId,
        source: "email",
        subject: "RFQ - brackets and spacers",
        fromAddress: "Sam@Robotics.example",
        messageId: MESSAGE_ID,
        bodyText: "Please quote 10 brackets.",
        ...rfq,
      });
    await testDb().update(quotes).set({ rfqId }).where(eq(quotes.id, q.id));
    return q;
  }

  it("replies in the RFQ's thread when the quote goes back to the address that sent it", async () => {
    const t = await setupTenant();
    const q = await threadedQuote(t);
    const form = await json<QuoteEmailsDto>(
      api(t.path(`/quotes/${q.id}/emails`), { as: t.userId }),
    );
    expect(form.rfqThread).toEqual({
      from: "Sam@Robotics.example",
      subject: "Re: RFQ - brackets and spacers",
    });

    const sent = await json<QuoteEmailDto>(
      emailIt(t, q.id, { to: "sam@robotics.example", message: "Hi Sam", copyMe: true }),
      201,
    );
    expect(sent.subject).toBe("Re: RFQ - brackets and spacers");
    const [msg, copy] = testFakes.email.sent;
    expect(msg?.subject).toBe("Re: RFQ - brackets and spacers");
    expect(msg?.headers).toEqual({ "In-Reply-To": MESSAGE_ID, References: MESSAGE_ID });
    // The quote's own label is still in the body and the file name.
    expect(msg?.text).toContain(`quote Q-${q.quoteNumber} from Test Shop`);
    // The estimator's copy is not a reply to a message they may never have received.
    expect(copy?.subject).toBe("Copy: Re: RFQ - brackets and spacers");
    expect(copy?.headers).toBeUndefined();
  });

  it("keeps the RFQ email's own References chain ahead of its Message-ID", async () => {
    const t = await setupTenant();
    const q = await threadedQuote(t, {
      threadReferences: "<root@shop.example> <prev@robotics.example>",
    });
    await json(emailIt(t, q.id, { to: "sam@robotics.example", message: "x" }), 201);
    expect(testFakes.email.sent[0]?.headers).toEqual({
      "In-Reply-To": MESSAGE_ID,
      References: `<root@shop.example> <prev@robotics.example> ${MESSAGE_ID}`,
    });
  });

  it("does not thread a quote sent to someone else, or an RFQ that was pasted in", async () => {
    const t = await setupTenant();
    const forwarded = await threadedQuote(t, { fromAddress: "estimator@shop.example" });
    const form = await json<QuoteEmailsDto>(
      api(t.path(`/quotes/${forwarded.id}/emails`), { as: t.userId }),
    );
    expect(form.rfqThread?.from).toBe("estimator@shop.example");
    await json(emailIt(t, forwarded.id, { to: "sam@robotics.example", message: "x" }), 201);

    const pasted = await threadedQuote(t, { source: "manual", messageId: null });
    const pastedForm = await json<QuoteEmailsDto>(
      api(t.path(`/quotes/${pasted.id}/emails`), { as: t.userId }),
    );
    expect(pastedForm.rfqThread).toBeNull();
    await json(emailIt(t, pasted.id, { to: "sam@robotics.example", message: "x" }), 201);

    const unsafe = await threadedQuote(t, { messageId: "<a@b>\r\nBcc: x@evil.example" });
    await json(emailIt(t, unsafe.id, { to: "sam@robotics.example", message: "x" }), 201);

    expect(testFakes.email.sent).toHaveLength(3);
    for (const m of testFakes.email.sent) {
      expect(m.headers).toBeUndefined();
      expect(m.subject).toMatch(/^Quote Q-\d+ from Test Shop$/);
    }
  });

  it("sends once more without the threading headers if the provider refuses them", async () => {
    const t = await setupTenant();
    const q = await threadedQuote(t);
    const original = testFakes.email.send.bind(testFakes.email);
    let calls = 0;
    testFakes.email.send = async (m) => {
      calls++;
      if (m.headers) throw new Error("Email send failed: E_HEADER_NOT_ALLOWED In-Reply-To");
      return original(m);
    };
    try {
      await json(emailIt(t, q.id, { to: "sam@robotics.example", message: "x" }), 201);
    } finally {
      testFakes.email.send = original;
    }
    expect(calls).toBe(2);
    expect(testFakes.email.sent).toHaveLength(1);
    expect(testFakes.email.sent[0]?.headers).toBeUndefined();
    expect(testFakes.email.sent[0]?.subject).toBe("Re: RFQ - brackets and spacers");
  });

  it("does not resend on any other failure", async () => {
    const t = await setupTenant();
    const q = await threadedQuote(t);
    const original = testFakes.email.send.bind(testFakes.email);
    let calls = 0;
    testFakes.email.send = async () => {
      calls++;
      throw new Error("Email send failed: E_RECIPIENT_SUPPRESSED");
    };
    try {
      expect((await emailIt(t, q.id, { to: "sam@robotics.example", message: "x" })).status).toBe(
        502,
      );
    } finally {
      testFakes.email.send = original;
    }
    expect(calls).toBe(1);
  });

  it("never reads another shop's RFQ", async () => {
    const a = await setupTenant();
    const b = await setupTenant();
    const q = await sentQuote(a);
    const rfqId = newId("rfq");
    await testDb().insert(rfqs).values({
      id: rfqId,
      orgId: b.orgId,
      source: "email",
      subject: "Other shop's RFQ",
      fromAddress: "sam@robotics.example",
      messageId: MESSAGE_ID,
    });
    await testDb().update(quotes).set({ rfqId }).where(eq(quotes.id, q.id));
    const form = await json<QuoteEmailsDto>(
      api(a.path(`/quotes/${q.id}/emails`), { as: a.userId }),
    );
    expect(form.rfqThread).toBeNull();
    await json(emailIt(a, q.id, { to: "sam@robotics.example", message: "x" }), 201);
    expect(testFakes.email.sent[0]?.headers).toBeUndefined();
  });
});
