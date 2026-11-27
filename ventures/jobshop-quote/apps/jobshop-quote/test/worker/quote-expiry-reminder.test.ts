// The day-before email about sent quotes that are about to expire (services/quotes/expiry-reminders.ts):
// one email per estimator per shop, only their own sent quotes valid until today or tomorrow, never
// twice, never to someone who left, opted out or has no confirmed address, never across shops.
import { env } from "cloudflare:workers";
import type { QuoteDetailDto, QuoteExpiryEmailsDto } from "@shared/api";
import type { CostInputs } from "@shared/costing";
import { createAppContext, testFakes } from "@worker/context";
import { member, quotes } from "@worker/db/schema";
import type { Env } from "@worker/env";
import {
  expiryReminderEmail,
  MAX_LISTED,
  remindExpiringQuotes,
} from "@worker/services/quotes/expiry-reminders";
import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { addMember, api, json, seedRateCard, setupTenant, testDb } from "./helpers";

type Tenant = Awaited<ReturnType<typeof setupTenant>>;

async function sentQuote(t: Tenant, as: string, validUntil: string, customerCompany = "Acme") {
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
  const sent = await json<QuoteDetailDto>(
    api(t.path(`/quotes/${q.id}/send`), { method: "POST", as }),
  );
  await testDb()
    .update(quotes)
    .set({ validUntil, customerContact: "Sam Lee", customerEmail: "sam@acme.example" })
    .where(eq(quotes.id, sent.id));
  return sent;
}

const run = (iso: string) =>
  remindExpiringQuotes(createAppContext(env as unknown as Env, { now: () => new Date(iso) }));
const mailTo = (userId: string) =>
  testFakes.email.sent.filter((m) => m.to.includes(`${userId}@example.test`));

beforeEach(() => {
  testFakes.email.sent.length = 0;
});

describe("day-before quote expiry emails", () => {
  it("lists each estimator's own quotes expiring today or tomorrow in one email, once", async () => {
    const t = await setupTenant();
    const est = await addMember(t.orgId, "estimator");
    const a = await sentQuote(t, est, "2031-04-11", "Acme");
    const b = await sentQuote(t, est, "2031-04-10", "Beta Robotics");
    const later = await sentQuote(t, est, "2031-04-12", "Later Inc");
    const ownerQuote = await sentQuote(t, t.userId, "2031-04-11", "Owner Co");

    const r = await run("2031-04-10T11:17:00Z");
    expect(r.quotes).toBeGreaterThanOrEqual(3);

    const mine = mailTo(est);
    expect(mine).toHaveLength(1);
    const msg = mine[0];
    expect(msg?.subject).toBe("2 of your quotes expire soon");
    // Today's first, then tomorrow's; each with its link.
    const text = msg?.text ?? "";
    expect(text.indexOf("Beta Robotics")).toBeLessThan(text.indexOf("for Acme"));
    expect(text).toContain("valid until 2031-04-10 (today)");
    expect(text).toContain("valid until 2031-04-11 (tomorrow)");
    expect(text).toContain("(Sam Lee, sam@acme.example)");
    expect(text).toContain(`/app/${t.orgId}/quotes/${a.id}`);
    expect(text).toContain(`/app/${t.orgId}/quotes/${b.id}`);
    expect(text).not.toContain(later.id);
    expect(text).not.toContain(ownerQuote.id);

    // The owner gets their own quote only.
    const ownerMail = mailTo(t.userId);
    expect(ownerMail).toHaveLength(1);
    expect(ownerMail[0]?.subject).toBe(`Q-${ownerQuote.quoteNumber} for Owner Co expires tomorrow`);

    // A second run the same day (or the next) never repeats a quote.
    await run("2031-04-10T15:00:00Z");
    expect(mailTo(est)).toHaveLength(1);
    await run("2031-04-11T11:17:00Z");
    const next = mailTo(est);
    expect(next).toHaveLength(2);
    expect(next[1]?.text).toContain(later.id);
    expect(next[1]?.text).not.toContain(a.id);
  });

  it("skips drafts, decided quotes, members who left and members who turned it off", async () => {
    const t = await setupTenant();
    const off = await addMember(t.orgId, "estimator");
    const leaver = await addMember(t.orgId, "estimator");
    await sentQuote(t, off, "2031-05-02");
    await sentQuote(t, leaver, "2031-05-02");
    const won = await sentQuote(t, t.userId, "2031-05-02");
    await testDb().update(quotes).set({ status: "won" }).where(eq(quotes.id, won.id));

    const setting = await json<QuoteExpiryEmailsDto>(
      api(t.path("/notifications/quote-expiry"), { as: off }),
    );
    expect(setting.quoteExpiry).toBe(true);
    const saved = await json<QuoteExpiryEmailsDto>(
      api(t.path("/notifications/quote-expiry"), {
        method: "PUT",
        as: off,
        json: { quoteExpiry: false },
      }),
    );
    expect(saved.quoteExpiry).toBe(false);
    await testDb()
      .delete(member)
      .where(and(eq(member.organizationId, t.orgId), eq(member.userId, leaver)));

    const r = await run("2031-05-01T11:17:00Z");
    expect(r.skipped).toBeGreaterThanOrEqual(2);
    expect(mailTo(off)).toHaveLength(0);
    expect(mailTo(leaver)).toHaveLength(0);
    expect(mailTo(t.userId)).toHaveLength(0);
  });

  it("keeps the setting per member and per shop", async () => {
    const a = await setupTenant();
    const b = await setupTenant();
    await json(
      api(a.path("/notifications/quote-expiry"), {
        method: "PUT",
        as: a.userId,
        json: { quoteExpiry: false },
      }),
    );
    const bSide = await json<QuoteExpiryEmailsDto>(
      api(b.path("/notifications/quote-expiry"), { as: b.userId }),
    );
    expect(bSide.quoteExpiry).toBe(true);
    // Another shop's member cannot read or change it.
    expect((await api(a.path("/notifications/quote-expiry"), { as: b.userId })).status).toBe(404);
    expect(
      (
        await api(a.path("/notifications/quote-expiry"), {
          method: "PUT",
          as: b.userId,
          json: { quoteExpiry: true },
        })
      ).status,
    ).toBe(404);
  });

  it("caps the list and keeps customer text on one line", () => {
    const many = Array.from({ length: MAX_LISTED + 3 }, (_, i) => ({
      id: `q${i}`,
      quoteNumber: 1000 + i,
      revNumber: i === 0 ? 2 : 1,
      customerCompany: i === 0 ? "Evil\r\nBcc: x@y.test" : "C",
      customerContact: null,
      customerEmail: null,
      headlineTotalCents: 123_456,
      validUntil: "2031-01-02",
    }));
    const mail = expiryReminderEmail({
      appUrl: "https://app.example.test/",
      orgId: "org_1",
      shopName: "Acme",
      today: "2031-01-01",
      quotes: many,
    });
    expect(mail.text).toContain("- and 3 more on the quote log");
    expect(mail.text).toContain("Q-1000 Rev 2 for Evil Bcc: x@y.test, $1,234.56");
    expect(mail.text).not.toMatch(/Evil\r?\n/);
    expect(mail.text).toContain("https://app.example.test/app/org_1/quotes/q0");
  });
});
