// Material price lists, part 2b: a supplier's price sheet imported into the Materials table. The
// supplier and the sheet's date are kept on each imported price's history row, and the preview
// names the open quotes each new price touches before anything is saved. Roles and tenancy.
import type { MaterialPriceHistoryDto, MaterialPriceImpactDto, QuoteDetailDto } from "@shared/api";
import type { CostInputs } from "@shared/costing";
import { describe, expect, it } from "vitest";
import { addMember, api, json, seedRateCard, setupTenant } from "./helpers";

type Tenant = Awaited<ReturnType<typeof setupTenant>>;
type Rates = Awaited<ReturnType<typeof seedRateCard>>;

const AL = "Aluminum 6061-T6 plate";
const perLb = (cents: number) => ({
  pricingBasis: "per_lb",
  pricePerLbCents: cents,
  stockPriceCents: null,
  pricePerFootCents: null,
});

const preview = (t: Tenant, prices: object[], as = t.userId) =>
  api(t.path("/rate-card/materials/price-impact/preview"), {
    method: "POST",
    as,
    json: { prices },
  });

const history = (t: Tenant, id: string) =>
  json<MaterialPriceHistoryDto>(api(t.path(`/rate-card/materials/${id}/prices`), { as: t.userId }));

async function draftQuote(t: Tenant, rates: Rates, customerCompany: string) {
  const inputs: Partial<CostInputs> = {
    quantities: [10],
    material: {
      materialId: rates.al,
      blank: { shape: "rect", thicknessIn: 0.75, widthIn: 2, lengthIn: 4 },
      partsPerStock: null,
    },
    operations: [
      { machineId: rates.mill, label: "OP10 mill", setupMinutes: 60, cycleMinutesPerPart: 12 },
    ],
  };
  const q = await json<QuoteDetailDto>(
    api(t.path("/quotes"), {
      method: "POST",
      as: t.userId,
      json: { customerCompany, customerContact: "Sam Lee", customerEmail: "sam@acme.example" },
    }),
    201,
  );
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

describe("import preview: quotes each new price touches", () => {
  it("names open quotes priced at the old price, for the prices the import would set", async () => {
    const t = await setupTenant();
    const rates = await seedRateCard(t);
    const draft = await draftQuote(t, rates, "Draft Co");

    const out = await json<MaterialPriceImpactDto>(
      preview(t, [
        { materialId: rates.al, ...perLb(486) },
        // The stainless price as it is on the card: no move, not listed.
        {
          materialId: rates.ss,
          pricingBasis: "per_stock",
          pricePerLbCents: null,
          stockPriceCents: 12_000,
          pricePerFootCents: null,
        },
      ]),
    );
    expect(out.materials).toHaveLength(1);
    expect(out.materials[0]).toMatchObject({ materialId: rates.al, name: AL });
    expect(out.materials[0]?.current.pricePerLbCents).toBe(486);
    expect(out.materials[0]?.quotes.map((q) => q.id)).toEqual([draft.id]);
    expect(out.materials[0]?.quotes[0]?.movePct).toBeCloseTo(8);

    // Read only: the card and the card's own "quotes this changes" are untouched.
    const live = await json<MaterialPriceImpactDto>(
      api(t.path("/rate-card/materials/price-impact"), { as: t.userId }),
    );
    expect(live.materials).toEqual([]);
  });

  it("refuses a malformed body; admins only; another shop's ids say nothing", async () => {
    const t = await setupTenant();
    const rates = await seedRateCard(t);
    await draftQuote(t, rates, "Draft Co");
    expect((await preview(t, [])).status).toBe(400);
    expect((await preview(t, [{ materialId: rates.al, ...perLb(-1) }])).status).toBe(400);
    expect((await preview(t, [{ materialId: rates.al, pricingBasis: "per_kg" }])).status).toBe(400);

    const estimator = await addMember(t.orgId, "estimator");
    expect((await preview(t, [{ materialId: rates.al, ...perLb(500) }], estimator)).status).toBe(
      403,
    );

    // Another shop asking about this shop's material id learns nothing.
    const other = await setupTenant();
    await seedRateCard(other);
    const res = await json<MaterialPriceImpactDto>(
      preview(other, [{ materialId: rates.al, ...perLb(999) }]),
    );
    expect(res.materials).toEqual([]);
    // And cannot call this shop's endpoint.
    const cross = await preview(t, [{ materialId: rates.al, ...perLb(999) }], other.userId);
    expect([403, 404]).toContain(cross.status);
  });
});

describe("import: the supplier's sheet and its date in the price history", () => {
  it("keeps supplier and date on each imported price, not on rows whose price stands", async () => {
    const t = await setupTenant();
    const rates = await seedRateCard(t);
    await json(
      api(t.path("/rate-card/import"), {
        method: "POST",
        as: t.userId,
        json: {
          kind: "materials",
          priceList: { supplier: "  Acme Metals ", date: "2026-11-20" },
          rows: [
            { row: 2, values: { name: AL, pricePerLbCents: 495 } },
            { row: 3, values: { name: "303 Stainless bar", stockDescription: "0.75 in x 12 ft" } },
            {
              row: 4,
              values: {
                name: "4140 bar",
                pricingBasis: "per_lb",
                pricePerLbCents: 310,
                densityLbPerIn3: 0.2836,
              },
            },
          ],
        },
      }),
    );
    const al = await history(t, rates.al);
    expect(al.entries[0]).toMatchObject({
      source: "import",
      pricePerLbCents: 495,
      supplier: "Acme Metals",
      priceListDate: "2026-11-20",
    });
    // The baseline row (before the import) has neither.
    expect(al.entries[1]).toMatchObject({ supplier: null, priceListDate: null });
    const ss = await history(t, rates.ss);
    expect(ss.entries.every((e) => e.supplier === null)).toBe(true);
  });

  it("is optional, and refuses a date that is not a real day (nothing saved)", async () => {
    const t = await setupTenant();
    const rates = await seedRateCard(t);
    await json(
      api(t.path("/rate-card/import"), {
        method: "POST",
        as: t.userId,
        json: { kind: "materials", rows: [{ row: 2, values: { name: AL, pricePerLbCents: 470 } }] },
      }),
    );
    expect((await history(t, rates.al)).entries[0]).toMatchObject({
      pricePerLbCents: 470,
      supplier: null,
      priceListDate: null,
    });
    for (const date of ["2026-02-30", "20/11/2026", "2026-11-20T00:00:00Z"]) {
      const res = await api(t.path("/rate-card/import"), {
        method: "POST",
        as: t.userId,
        json: {
          kind: "materials",
          priceList: { date },
          rows: [{ row: 2, values: { name: AL, pricePerLbCents: 480 } }],
        },
      });
      expect(res.status).toBe(400);
    }
    expect((await history(t, rates.al)).entries[0]?.pricePerLbCents).toBe(470);
  });
});
