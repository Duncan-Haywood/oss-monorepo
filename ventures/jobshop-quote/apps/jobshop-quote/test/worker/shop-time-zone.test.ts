// The shop's time zone (shop_settings.time_zone): set on the rate card by an admin, checked against
// Intl's zone list, and used for the win/loss months and the CSV's dates. Never across shops.
import type { QuoteDetailDto, RateCardDto, WinLossDto } from "@shared/api";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { quotes } from "../../src/worker/db/schema";
import { addMember, api, json, seedRateCard, setupTenant, testDb } from "./helpers";

type Tenant = Awaited<ReturnType<typeof setupTenant>>;

const setZone = (t: Tenant, timeZone: string | null, as = t.userId) =>
  api(t.path("/settings"), { method: "PATCH", as, json: { timeZone } });

async function wonQuoteAt(t: Tenant, decidedAt: Date) {
  const r = await seedRateCard(t);
  const q = await json<QuoteDetailDto>(
    api(t.path("/quotes"), { method: "POST", as: t.userId, json: { customerCompany: "Acme" } }),
    201,
  );
  await json(
    api(t.path(`/quotes/${q.id}/lines`), {
      method: "POST",
      as: t.userId,
      json: {
        partNumber: "BRK-1",
        revision: "A",
        inputs: {
          quantities: [5],
          customerSuppliedMaterial: true,
          material: null,
          operations: [{ machineId: r.mill, label: "", setupMinutes: 30, cycleMinutesPerPart: 5 }],
        },
      },
    }),
    201,
  );
  await json(api(t.path(`/quotes/${q.id}/send`), { method: "POST", as: t.userId }));
  await json(
    api(t.path(`/quotes/${q.id}/outcome`), {
      method: "POST",
      as: t.userId,
      json: { outcome: "won" },
    }),
  );
  await testDb().update(quotes).set({ decidedAt }).where(eq(quotes.id, q.id));
}

describe("shop time zone", () => {
  it("is null (UTC) until set, stored in Intl's spelling, and unknown names are refused", async () => {
    const t = await setupTenant();
    const card = () => json<RateCardDto>(api(t.path("/rate-card"), { as: t.userId }));
    expect((await card()).settings.timeZone).toBeNull();

    expect((await setZone(t, "america/chicago")).status).toBe(200);
    expect((await card()).settings.timeZone).toBe("America/Chicago");

    expect((await setZone(t, "Mars/Olympus")).status).toBe(400);
    expect((await setZone(t, "x".repeat(65))).status).toBe(400);
    expect((await card()).settings.timeZone).toBe("America/Chicago");

    expect((await setZone(t, null)).status).toBe(200);
    expect((await card()).settings.timeZone).toBeNull();
  });

  it("only an admin sets it, and only for their own shop", async () => {
    const a = await setupTenant();
    const b = await setupTenant();
    const estimator = await addMember(a.orgId, "estimator");
    expect((await setZone(a, "America/Denver", estimator)).status).toBe(403);
    const cross = await api(a.path("/settings"), {
      method: "PATCH",
      as: b.userId,
      json: { timeZone: "America/Denver" },
    });
    expect([403, 404]).toContain(cross.status);
    const theirs = await json<RateCardDto>(api(b.path("/rate-card"), { as: b.userId }));
    expect(theirs.settings.timeZone).toBeNull();
    const ours = await json<RateCardDto>(api(a.path("/rate-card"), { as: a.userId }));
    expect(ours.settings.timeZone).toBeNull();
  });

  it("puts a quote won on the evening of 31 October in October, in the report and the CSV", async () => {
    const t = await setupTenant();
    // 7 pm CDT on 31 Oct 2026 is midnight UTC on 1 Nov.
    await wonQuoteAt(t, new Date(Date.now() - 86_400_000));
    await wonQuoteAt(t, new Date("2026-11-01T00:00:00.000Z"));
    const months = async () =>
      json<WinLossDto>(api(t.path("/quotes/analytics?window=all"), { as: t.userId }));

    const utc = await months();
    expect(utc.timeZone).toBe("UTC");
    expect(utc.byMonth.find((m) => m.key === "2026-11")?.won).toBeGreaterThan(0);
    expect(utc.byMonth.find((m) => m.key === "2026-10")).toBeUndefined();

    await json(setZone(t, "America/Chicago"));
    const local = await months();
    expect(local.timeZone).toBe("America/Chicago");
    expect(local.byMonth[0]).toMatchObject({ key: "2026-10", won: 1 });
    expect(local.totals.won).toBe(utc.totals.won);

    const csv = await (
      await api(t.path("/quotes/analytics.csv?window=all"), { as: t.userId })
    ).text();
    expect(csv.split("\r\n")[0]).toContain("Decided (America/Chicago)");
    expect(csv).toContain(",2026-10-31,");
  });
});
