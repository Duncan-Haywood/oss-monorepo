// Customer links (services/quotes/customer-link.ts): the customer reads a sent quote from a link,
// downloads the exact PDF, and accepts (won at the chosen breaks' total) or declines (lost) once.
// Links are per quote, turned off by the shop, never readable across shops, and the shop's
// estimators are emailed the answer.
import type { QuoteDetailDto, QuoteEmailDto } from "@shared/api";
import type { CostInputs } from "@shared/costing";
import type {
  CreatedCustomerLinkDto,
  CustomerLinksDto,
  CustomerQuoteDto,
} from "@shared/customer-link";
import { testFakes } from "@worker/context";
import { quoteLinks, quotes } from "@worker/db/schema";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { addMember, api, json, seedRateCard, setupTenant, testDb } from "./helpers";

type Tenant = Awaited<ReturnType<typeof setupTenant>>;

async function sentQuote(t: Tenant, opts: { validUntil?: string } = {}) {
  const rates = await seedRateCard(t);
  const inputs: Partial<CostInputs> = {
    quantities: [10, 50],
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
        notes: "Deburr all edges.",
        ...(opts.validUntil ? { validUntil: opts.validUntil } : {}),
      },
    }),
  );
  return json<QuoteDetailDto>(
    api(t.path(`/quotes/${q.id}/send`), { method: "POST", as: t.userId }),
  );
}

const tokenOf = (url: string) => decodeURIComponent(url.split("/q/")[1] ?? "");

async function makeLink(t: Tenant, quoteId: string, as = t.userId) {
  const d = await json<CreatedCustomerLinkDto>(
    api(t.path(`/quotes/${quoteId}/customer-links`), { method: "POST", as }),
    201,
  );
  return { ...d, token: tokenOf(d.url) };
}

const view = (token: string) => api(`/api/quote-links/${encodeURIComponent(token)}`);
const respond = (token: string, body: unknown) =>
  api(`/api/quote-links/${encodeURIComponent(token)}/respond`, { method: "POST", json: body });

beforeEach(() => {
  testFakes.email.sent.length = 0;
});

describe("customer links", () => {
  it("shows the sent quote's customer-facing facts, without a session", async () => {
    const t = await setupTenant();
    const q = await sentQuote(t);
    const { url, token, links } = await makeLink(t, q.id);
    expect(url).toMatch(/\/q\/[A-Za-z0-9_-]{43}$/);
    expect(links.links).toHaveLength(1);
    // Only the hash is stored.
    const row = await testDb().select().from(quoteLinks).where(eq(quoteLinks.quoteId, q.id)).get();
    expect(row?.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(row?.tokenHash).not.toContain(token);

    const d = await json<CustomerQuoteDto>(view(token));
    expect(d.state).toBe("open");
    expect(d.shop.displayName).toBe("Test Shop");
    expect(d.quote).toMatchObject({
      label: "Q-1001",
      customerCompany: "Example Robotics LLC",
      notes: "Deburr all edges.",
    });
    expect(d.lines).toHaveLength(1);
    expect(d.lines[0]?.breaks.map((b) => b.quantity)).toEqual([10, 50]);
    // No internal cost fields reach the customer.
    const raw = JSON.stringify(d);
    for (const word of ["costCents", "markupCents", "basis", "snapshot", "hourlyRate", "inputs"]) {
      expect(raw).not.toContain(word);
    }
    const seen = await testDb().select().from(quoteLinks).where(eq(quoteLinks.quoteId, q.id)).get();
    expect(seen?.lastViewedAt).toBeTruthy();
  });

  it("serves the exact PDF that was sent", async () => {
    const t = await setupTenant();
    const q = await sentQuote(t);
    const { token } = await makeLink(t, q.id);
    const res = await api(`/api/quote-links/${token}/pdf`);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    const bytes = new Uint8Array(await res.arrayBuffer());
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
    expect(hex).toBe(q.sentPdfSha256);
  });

  it("accepting marks the quote won at the chosen break, with the PO, and emails the estimator", async () => {
    const t = await setupTenant();
    const q = await sentQuote(t);
    const { token } = await makeLink(t, q.id);
    const line = q.lines[0];
    const fifty = line?.breaks?.find((b) => b.quantity === 50);
    if (!line || !fifty) throw new Error("no 50 break");

    const d = await json<CustomerQuoteDto>(
      respond(token, {
        decision: "accept",
        name: "Sam Buyer",
        email: "sam@robotics.example",
        poNumber: "PO-4471",
        choices: [{ lineId: line.id, quantity: 50 }],
        note: "Ship in two lots please",
      }),
    );
    expect(d.state).toBe("accepted");
    expect(d.response).toMatchObject({
      decision: "accepted",
      poNumber: "PO-4471",
      amountCents: fifty.totalCents,
    });

    const after = await json<QuoteDetailDto>(api(t.path(`/quotes/${q.id}`), { as: t.userId }));
    expect(after).toMatchObject({
      status: "won",
      poNumber: "PO-4471",
      wonAmountCents: fifty.totalCents,
    });

    const mail = testFakes.email.sent.find((m) => m.subject.includes("accepted"));
    expect(mail?.to).toEqual([`${t.userId}@example.test`]);
    expect(mail?.subject).toBe("Quote Q-1001 accepted by Example Robotics LLC, PO PO-4471");
    expect(mail?.text).toContain("BRK-1001: 50 at");
    expect(mail?.text).toContain("Ship in two lots please");

    // The shop sees the answer.
    const links = await json<CustomerLinksDto>(
      api(t.path(`/quotes/${q.id}/customer-links`), { as: t.userId }),
    );
    expect(links.response?.decision).toBe("accepted");
    expect(links.canCreate).toBe(false);

    // Only once.
    const again = await respond(token, { decision: "decline", name: "Someone else" });
    expect(again.status).toBe(409);
  });

  it("refuses a quantity the quote does not carry", async () => {
    const t = await setupTenant();
    const q = await sentQuote(t);
    const { token } = await makeLink(t, q.id);
    const res = await respond(token, {
      decision: "accept",
      name: "Sam",
      choices: [{ lineId: q.lines[0]?.id, quantity: 37 }],
    });
    expect(res.status).toBe(400);
    const still = await testDb().select().from(quotes).where(eq(quotes.id, q.id)).get();
    expect(still?.status).toBe("sent");
  });

  it("declining marks the quote lost with the customer's reason", async () => {
    const t = await setupTenant();
    const q = await sentQuote(t);
    const { token } = await makeLink(t, q.id);
    const d = await json<CustomerQuoteDto>(
      respond(token, { decision: "decline", name: "Sam", note: "Lead time too long" }),
    );
    expect(d.state).toBe("declined");
    const row = await testDb().select().from(quotes).where(eq(quotes.id, q.id)).get();
    expect(row).toMatchObject({
      status: "lost",
      lostReason: "Declined online: Lead time too long",
    });
    expect(testFakes.email.sent.some((m) => m.subject.includes("declined"))).toBe(true);
  });

  it("refuses an answer once the quote is past its valid-until day", async () => {
    const t = await setupTenant();
    const q = await sentQuote(t, { validUntil: "2020-01-01" });
    const { token } = await makeLink(t, q.id);
    const d = await json<CustomerQuoteDto>(view(token));
    expect(d.state).toBe("expired");
    const res = await respond(token, { decision: "decline", name: "Sam" });
    expect(res.status).toBe(409);
  });

  it("turning the links off makes them 404; a bad token is a 404 too", async () => {
    const t = await setupTenant();
    const q = await sentQuote(t);
    const { token } = await makeLink(t, q.id);
    const off = await json<CustomerLinksDto>(
      api(t.path(`/quotes/${q.id}/customer-links`), { method: "DELETE", as: t.userId }),
    );
    expect(off.links[0]?.revokedAt).toBeTruthy();
    expect((await view(token)).status).toBe(404);
    expect((await respond(token, { decision: "decline", name: "Sam" })).status).toBe(404);
    expect((await view("nope")).status).toBe(404);
    expect((await view("A".repeat(43))).status).toBe(404);
  });

  it("only an open, sent quote gets a link, and only estimators make them", async () => {
    const t = await setupTenant();
    const draft = await json<QuoteDetailDto>(
      api(t.path("/quotes"), { method: "POST", as: t.userId, json: { customerCompany: "X" } }),
      201,
    );
    const r = await api(t.path(`/quotes/${draft.id}/customer-links`), {
      method: "POST",
      as: t.userId,
    });
    expect(r.status).toBe(409);
    const q = await sentQuote(t);
    const viewer = await addMember(t.orgId, "viewer");
    const v = await api(t.path(`/quotes/${q.id}/customer-links`), { method: "POST", as: viewer });
    expect(v.status).toBe(403);
    // A viewer can still read them.
    await json(api(t.path(`/quotes/${q.id}/customer-links`), { as: viewer }));
  });

  it("another shop cannot list, make or turn off this shop's links", async () => {
    const t = await setupTenant();
    const other = await setupTenant();
    const q = await sentQuote(t);
    await makeLink(t, q.id);
    for (const method of ["GET", "POST", "DELETE"]) {
      const res = await api(other.path(`/quotes/${q.id}/customer-links`), {
        method,
        as: other.userId,
      });
      expect(res.status).toBe(404);
    }
    // And a member of the other shop cannot reach this shop's route at all.
    const res = await api(t.path(`/quotes/${q.id}/customer-links`), { as: other.userId });
    expect([403, 404]).toContain(res.status);
  });

  it("the quote email can carry its own link, which goes off if the send fails", async () => {
    const t = await setupTenant();
    const q = await sentQuote(t);
    const sent = await json<QuoteEmailDto>(
      api(t.path(`/quotes/${q.id}/email`), {
        method: "POST",
        as: t.userId,
        json: { to: "sam@robotics.example", message: "Hi Sam", customerLink: true },
      }),
      201,
    );
    expect(sent.status).toBe("sent");
    const mail = testFakes.email.sent.find((m) => m.to.includes("sam@robotics.example"));
    const m = mail?.text.match(/Accept or decline this quote online: (\S+)/);
    expect(m).toBeTruthy();
    const token = tokenOf(m?.[1] ?? "");
    expect((await json<CustomerQuoteDto>(view(token))).state).toBe("open");
    const links = await json<CustomerLinksDto>(
      api(t.path(`/quotes/${q.id}/customer-links`), { as: t.userId }),
    );
    expect(links.links[0]?.emailed).toBe(true);

    // Without the box: no link.
    testFakes.email.sent.length = 0;
    await json(
      api(t.path(`/quotes/${q.id}/email`), {
        method: "POST",
        as: t.userId,
        json: { to: "sam@robotics.example", message: "Hi again" },
      }),
      201,
    );
    expect(testFakes.email.sent[0]?.text).not.toContain("Accept or decline");
  });

  it("a failed send turns its link off, so no live link exists that reached nobody", async () => {
    const t = await setupTenant();
    const q = await sentQuote(t);
    const original = testFakes.email.send.bind(testFakes.email);
    testFakes.email.send = async () => {
      throw new Error("Email send failed: E_RECIPIENT_SUPPRESSED");
    };
    try {
      const res = await api(t.path(`/quotes/${q.id}/email`), {
        method: "POST",
        as: t.userId,
        json: { to: "sam@robotics.example", message: "Hi", customerLink: true },
      });
      expect(res.status).toBe(502);
    } finally {
      testFakes.email.send = original;
    }
    const links = await json<CustomerLinksDto>(
      api(t.path(`/quotes/${q.id}/customer-links`), { as: t.userId }),
    );
    expect(links.links).toHaveLength(1);
    expect(links.links[0]?.revokedAt).toBeTruthy();
  });
});
