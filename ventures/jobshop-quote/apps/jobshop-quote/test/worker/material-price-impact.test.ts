// Material price lists, part 2: "quotes this changes". Open quotes (drafts, sent) priced at a
// material price the card no longer has, the threshold, decided quotes left out, roles and tenancy.
import type { MaterialDto, MaterialPriceImpactDto, QuoteDetailDto } from "@shared/api";
import type { CostInputs } from "@shared/costing";
import { describe, expect, it } from "vitest";
import { addMember, api, json, seedRateCard, setupTenant } from "./helpers";

type Tenant = Awaited<ReturnType<typeof setupTenant>>;
type Rates = Awaited<ReturnType<typeof seedRateCard>>;

const impact = (t: Tenant, query = "", as = t.userId) =>
  json<MaterialPriceImpactDto>(api(t.path(`/rate-card/materials/price-impact${query}`), { as }));

const aluminum = (pricePerLbCents: number) => ({
  name: "Aluminum 6061-T6 plate",
  pricingBasis: "per_lb",
  pricePerLbCents,
  densityLbPerIn3: 0.0975,
  scrapBps: 1_000,
  minChargeCents: 2_500,
});
const setAluminum = (t: Tenant, rates: Rates, cents: number) =>
  json<MaterialDto>(
    api(t.path(`/rate-card/materials/${rates.al}`), {
      method: "PUT",
      as: t.userId,
      json: aluminum(cents),
    }),
  );

/** A quote with one priced aluminum line; sent and/or decided on request. */
async function quote(
  t: Tenant,
  rates: Rates,
  customerCompany: string,
  then: "draft" | "sent" | "won" = "draft",
) {
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
  if (then === "draft") return q;
  await json(api(t.path(`/quotes/${q.id}/send`), { method: "POST", as: t.userId }));
  if (then === "won") {
    await json(
      api(t.path(`/quotes/${q.id}/outcome`), {
        method: "POST",
        as: t.userId,
        json: { outcome: "won" },
      }),
    );
  }
  return q;
}

describe("quotes this changes (material price impact)", () => {
  it("lists open quotes priced at the old price, not decided ones, with the move", async () => {
    const t = await setupTenant();
    const rates = await seedRateCard(t);
    const draft = await quote(t, rates, "Draft Co");
    const sent = await quote(t, rates, "Sent Co", "sent");
    await quote(t, rates, "Won Co", "won");

    // Nothing has moved yet.
    expect((await impact(t)).materials).toEqual([]);

    await setAluminum(t, rates, 486); // 4.50 -> 4.86: up 8%
    const out = await impact(t);
    expect(out).toMatchObject({ minPct: 0, quotesRead: 2, truncated: false });
    expect(out.materials).toHaveLength(1);
    const [al] = out.materials;
    expect(al).toMatchObject({ materialId: rates.al, name: "Aluminum 6061-T6 plate" });
    expect(al?.current.pricePerLbCents).toBe(486);
    expect(al?.quotes.map((q) => q.id).sort()).toEqual([draft.id, sent.id].sort());
    for (const q of al?.quotes ?? []) {
      expect(q.priced.pricePerLbCents).toBe(450);
      expect(q.movePct).toBeCloseTo(8);
      expect(q.lines).toBe(1);
    }
    expect(al?.quotes.find((q) => q.id === sent.id)?.status).toBe("sent");
    // The stainless row never moved, so it is not listed.
    expect(out.materials.some((m) => m.materialId === rates.ss)).toBe(false);
  });

  it("applies the threshold, and re-pricing the draft clears it", async () => {
    const t = await setupTenant();
    const rates = await seedRateCard(t);
    const draft = await quote(t, rates, "Draft Co");
    await setAluminum(t, rates, 459); // up 2%
    expect((await impact(t, "?minPct=5")).materials).toEqual([]);
    expect((await impact(t, "?minPct=2")).materials[0]?.quotes).toHaveLength(1);
    expect((await impact(t, "?minPct=")).minPct).toBe(0);
    expect(
      (await api(t.path("/rate-card/materials/price-impact?minPct=-1"), { as: t.userId })).status,
    ).toBe(400);
    expect(
      (await api(t.path("/rate-card/materials/price-impact?minPct=abc"), { as: t.userId })).status,
    ).toBe(400);

    // "Re-price" on the quote page prices every line from today's card.
    await json(api(t.path(`/quotes/${draft.id}/recalculate`), { method: "POST", as: t.userId }));
    expect((await impact(t)).materials).toEqual([]);
  });

  it("any member reads it; another shop sees none of it", async () => {
    const t = await setupTenant();
    const rates = await seedRateCard(t);
    await quote(t, rates, "Draft Co");
    await setAluminum(t, rates, 600);
    const viewer = await addMember(t.orgId, "viewer");
    expect((await impact(t, "", viewer)).materials).toHaveLength(1);

    const other = await setupTenant();
    await seedRateCard(other);
    expect((await impact(other)).materials).toEqual([]);
    // A user of another shop cannot read this shop's list.
    const res = await api(t.path("/rate-card/materials/price-impact"), { as: other.userId });
    expect([403, 404]).toContain(res.status);
  });
});
