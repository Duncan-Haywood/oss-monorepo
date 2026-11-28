// GET /reports/pricing: fee models by platform from the shop's own orders (shared/pricing.ts), tenant scoped.
import type { PricingReport } from "@shared/pricing";
import { describe, expect, it } from "vitest";
import { api, json, setupTenant } from "./helpers";

type Tenant = Awaited<ReturnType<typeof setupTenant>>;
const path = (t: Tenant, p: string) => `/api/orgs/${t.orgId}${p}`;

const pricing = async (t: Tenant, q = "from=2026-01-01&to=2026-12-31") =>
  api(path(t, `/reports/pricing?${q}`), { as: t.userId });

describe("pricing report", () => {
  it("fits 30¢ + 3% from five direct sales, with their net postage, and keeps other shops out", async () => {
    const t = await setupTenant();
    for (const [i, price] of [1000, 2000, 3000, 4000, 5000].entries()) {
      const res = await api(path(t, "/sales"), {
        method: "POST",
        as: t.userId,
        json: {
          date: `2026-03-1${i}`,
          title: `Sale ${i}`,
          itemCents: price,
          shippingChargedCents: 500,
          paymentFeeCents: 30 + (price * 3) / 100,
          shippingLabelCents: 700,
        },
      });
      expect(res.status).toBe(201);
    }
    const res = await pricing(t);
    expect(res.status).toBe(200);
    const r = await json<PricingReport>(res);
    expect(r.platforms).toHaveLength(1);
    expect(r.platforms[0]).toMatchObject({
      platform: "direct",
      orders: 5,
      model: "fit",
      fixedCents: 30,
      netPostageCents: 200,
      typicalMissCents: 0,
    });
    expect(r.platforms[0]?.percent).toBeCloseTo(0.03, 10);

    // Outside the dates: nothing.
    const early = await json<PricingReport>(await pricing(t, "from=2025-01-01&to=2025-12-31"));
    expect(early.platforms).toEqual([]);

    // Another shop sees none of it.
    const other = await setupTenant();
    const theirs = await json<PricingReport>(await pricing(other));
    expect(theirs.platforms).toEqual([]);
    // And cannot read this shop's.
    const cross = await api(path(t, "/reports/pricing?from=2026-01-01&to=2026-12-31"), {
      as: other.userId,
    });
    expect(cross.status).toBeGreaterThanOrEqual(400);
  });

  it("refuses dates in the wrong order", async () => {
    const t = await setupTenant();
    expect((await pricing(t, "from=2026-12-31&to=2026-01-01")).status).toBe(400);
  });
});
