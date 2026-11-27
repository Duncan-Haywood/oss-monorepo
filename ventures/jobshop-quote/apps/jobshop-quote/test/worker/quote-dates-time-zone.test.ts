// Quote dates on the shop's own calendar (shop_settings.time_zone, UTC when unset): the date printed
// on the PDF, the valid-until day a new quote or revision gets, which day the expiry job counts as
// "today" for each shop, and the day-before email's "today" and "tomorrow". Instants stay UTC.
import { env } from "cloudflare:workers";
import type { CostInputs } from "@shared/costing";
import { createAppContext, testFakes } from "@worker/context";
import { quotes } from "@worker/db/schema";
import type { Env } from "@worker/env";
import { createQuote, expireQuotes, reviseQuote, sendQuote } from "@worker/services/quotes";
import { remindExpiringQuotes } from "@worker/services/quotes/expiry-reminders";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { api, json, seedRateCard, setupTenant, testDb } from "./helpers";

type Tenant = Awaited<ReturnType<typeof setupTenant>>;

const at = (iso: string) => createAppContext(env as unknown as Env, { now: () => new Date(iso) });

async function zonedShop(timeZone: string | null) {
  const t = await setupTenant();
  if (timeZone) {
    await json(api(t.path("/settings"), { method: "PATCH", as: t.userId, json: { timeZone } }));
  }
  return t;
}

/** A priced draft written by the shop's owner at the instant `iso`. */
async function draftAt(t: Tenant, iso: string) {
  const rates = await seedRateCard(t);
  const q = await createQuote(at(iso), t.orgId, t.userId, {
    rfqId: null,
    customerCompany: "Acme",
  });
  const inputs: Partial<CostInputs> = {
    quantities: [10],
    customerSuppliedMaterial: true,
    material: null,
    operations: [
      { machineId: rates.mill, label: "OP10 mill", setupMinutes: 60, cycleMinutesPerPart: 12 },
    ],
  };
  await json(
    api(t.path(`/quotes/${q.id}/lines`), {
      method: "POST",
      as: t.userId,
      json: { partNumber: "BRK-1", revision: "A", inputs },
    }),
    201,
  );
  return q;
}

/** A sent quote whose valid-until day is set by hand. */
async function sentUntil(t: Tenant, validUntil: string) {
  const q = await draftAt(t, new Date().toISOString());
  await json(api(t.path(`/quotes/${q.id}/send`), { method: "POST", as: t.userId }));
  await testDb().update(quotes).set({ validUntil }).where(eq(quotes.id, q.id));
  return q.id;
}

const status = async (id: string) =>
  (await testDb().select().from(quotes).where(eq(quotes.id, id)).get())?.status;

const pdfText = async (t: Tenant, id: string) =>
  new TextDecoder("latin1").decode(
    await (await api(t.path(`/quotes/${id}/pdf`), { as: t.userId })).arrayBuffer(),
  );

beforeEach(() => {
  testFakes.email.sent.length = 0;
});

describe("quote dates in the shop's time zone", () => {
  it("dates a quote sent at 8 pm in Chicago that day, and counts its valid-until day from there", async () => {
    // 01:00 UTC on 1 Nov 2030 is 8 pm CDT on 31 Oct (US DST ends 3 Nov 2030).
    const evening = "2030-11-01T01:00:00Z";
    const chicago = await zonedShop("America/Chicago");
    const utc = await zonedShop(null);

    const local = await draftAt(chicago, evening);
    const plain = await draftAt(utc, evening);
    // Default quoteValidDays is 30.
    expect(local.validUntil).toBe("2030-11-30");
    expect(plain.validUntil).toBe("2030-12-01");

    // The preview and the frozen PDF both print the shop's day.
    await sendQuote(at(evening), chicago.orgId, local.id);
    await sendQuote(at(evening), utc.orgId, plain.id);
    expect(await pdfText(chicago, local.id)).toContain("Date 2030-10-31");
    expect(await pdfText(utc, plain.id)).toContain("Date 2030-11-01");

    // A revision written the same evening starts its own 30 days from the shop's day too.
    const rev = await reviseQuote(at(evening), chicago.orgId, chicago.userId, local.id);
    expect(rev.validUntil).toBe("2030-11-30");
  });

  it("expires each shop's quotes when its own day has passed", async () => {
    // Kiritimati is UTC+14 and Pago Pago UTC-11 all year (no DST).
    const ahead = await zonedShop("Pacific/Kiritimati");
    const behind = await zonedShop("Pacific/Pago_Pago");
    const utc = await zonedShop(null);
    const a = await sentUntil(ahead, "2030-03-10");
    const b = await sentUntil(behind, "2030-03-10");
    const u = await sentUntil(utc, "2030-03-10");

    // 11:17 UTC on 10 Mar is already 01:17 on 11 Mar in Kiritimati.
    await expireQuotes(at("2030-03-10T11:17:00Z"));
    expect(await status(a)).toBe("expired");
    expect(await status(b)).toBe("sent");
    expect(await status(u)).toBe("sent");

    // 10:30 UTC on 11 Mar is still 23:30 on 10 Mar in Pago Pago.
    await expireQuotes(at("2030-03-11T10:30:00Z"));
    expect(await status(u)).toBe("expired");
    expect(await status(b)).toBe("sent");

    await expireQuotes(at("2030-03-11T11:17:00Z"));
    expect(await status(b)).toBe("expired");
  });

  it("reminds by the shop's own today and tomorrow", async () => {
    const ahead = await zonedShop("Pacific/Kiritimati");
    const utc = await zonedShop(null);
    // At 11:17 UTC on 10 Apr it is 11 Apr in Kiritimati: 12 Apr is its tomorrow, 10 Apr its past.
    const tomorrowThere = await sentUntil(ahead, "2031-04-12");
    const pastThere = await sentUntil(ahead, "2031-04-10");
    const dayAfterHere = await sentUntil(utc, "2031-04-12");

    await remindExpiringQuotes(at("2031-04-10T11:17:00Z"));
    const reminded = async (id: string) =>
      (await testDb().select().from(quotes).where(eq(quotes.id, id)).get())?.expiryRemindedAt;
    expect(await reminded(tomorrowThere)).not.toBeNull();
    expect(await reminded(pastThere)).toBeNull();
    expect(await reminded(dayAfterHere)).toBeNull();

    const mail = testFakes.email.sent.filter((m) => m.to.includes(`${ahead.userId}@example.test`));
    expect(mail).toHaveLength(1);
    expect(mail[0]?.subject).toContain("expires tomorrow");
    expect(mail[0]?.text).toContain("valid until 2031-04-12 (tomorrow)");
    expect(
      testFakes.email.sent.filter((m) => m.to.includes(`${utc.userId}@example.test`)),
    ).toHaveLength(0);
  });
});
