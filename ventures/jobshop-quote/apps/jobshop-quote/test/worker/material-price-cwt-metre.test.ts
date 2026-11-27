// Material prices kept per hundredweight or per metre through the Worker: the form route, D1 round
// trip, the costing preview at the exact $/lb, the price history in the supplier's unit, the
// spreadsheet import swapping a $/lb for a cwt price, and another shop never seeing the row.
import type { MaterialDto, MaterialPriceHistoryDto, RateCardDto } from "@shared/api";
import { describe, expect, it } from "vitest";
import { api, json, setupTenant } from "./helpers";

type Tenant = Awaited<ReturnType<typeof setupTenant>>;
type Preview = {
  ok: boolean;
  result?: { breaks: { quantity: number; materialCents: number }[]; basis: string[] };
  issues?: { code: string }[];
};

async function saw(t: Tenant) {
  return json<{ id: string }>(
    api(t.path("/rate-card/machines"), {
      method: "POST",
      as: t.userId,
      json: { name: "Band saw", kind: "other", hourlyRateCents: 6_000 },
    }),
    201,
  );
}

const weighed = (materialId: string, machineId: string) => ({
  quantities: [3],
  customerSuppliedMaterial: false,
  material: { materialId, blank: { shape: "weight", weightLb: 10 }, partsPerStock: null },
  operations: [{ machineId, label: "Cut", setupMinutes: 1, cycleMinutesPerPart: 0 }],
  finishing: [],
  extras: [],
});

const preview = (t: Tenant, body: unknown) =>
  json<Preview>(
    api(t.path("/costing/preview"), { method: "POST", as: t.userId, json: { inputs: body } }),
  );

describe("per-cwt and per-metre material prices", () => {
  it("saves a cwt price exactly and prices at the exact $/lb", async () => {
    const t = await setupTenant();
    const m = await saw(t);
    const row = await json<MaterialDto>(
      api(t.path("/rate-card/materials"), {
        method: "POST",
        as: t.userId,
        json: { name: "A36 plate", pricingBasis: "per_lb", pricePerCwtCents: 41_250 },
      }),
      201,
    );
    expect(row).toMatchObject({ pricePerLbCents: null, pricePerCwtCents: 41_250 });
    const p = await preview(t, weighed(row.id, m.id));
    expect(p.ok).toBe(true);
    expect(p.result?.breaks[0]?.materialCents).toBe(12_375);
    expect(p.result?.basis[0]).toMatch(/\$412\.50\/cwt \(\$4\.125\/lb\)/);

    // A new cwt price is a history row in the supplier's unit.
    const { id: _id, priceSetAt: _at, ...fields } = row;
    await json<MaterialDto>(
      api(t.path(`/rate-card/materials/${row.id}`), {
        method: "PUT",
        as: t.userId,
        json: { ...fields, pricePerCwtCents: 44_000 },
      }),
    );
    const history = await json<MaterialPriceHistoryDto>(
      api(t.path(`/rate-card/materials/${row.id}/prices`), { as: t.userId }),
    );
    expect(history.entries.map((e) => [e.source, e.pricePerCwtCents, e.pricePerLbCents])).toEqual([
      ["edit", 44_000, null],
      ["create", 41_250, null],
    ]);

    // Both units on one row is refused, nothing saved.
    const both = await api(t.path(`/rate-card/materials/${row.id}`), {
      method: "PUT",
      as: t.userId,
      json: { ...fields, pricePerLbCents: 425, pricePerCwtCents: 44_000 },
    });
    expect(both.status).toBe(400);

    // Another shop cannot read or price it.
    const other = await setupTenant();
    const theirs = await json<RateCardDto>(api(other.path("/rate-card"), { as: other.userId }));
    expect(theirs.materials.some((x) => x.id === row.id)).toBe(false);
    const peek = await api(other.path(`/rate-card/materials/${row.id}/prices`), {
      as: other.userId,
    });
    expect(peek.status).toBe(404);
  });

  it("saves a per-metre price for per-foot stock", async () => {
    const t = await setupTenant();
    const row = await json<MaterialDto>(
      api(t.path("/rate-card/materials"), {
        method: "POST",
        as: t.userId,
        json: { name: "6063 tube 1 in OD", pricingBasis: "per_ft", pricePerMetreCents: 1_000 },
      }),
      201,
    );
    const card = await json<RateCardDto>(api(t.path("/rate-card"), { as: t.userId }));
    expect(card.materials.find((x) => x.id === row.id)).toMatchObject({
      pricingBasis: "per_ft",
      pricePerFootCents: null,
      pricePerMetreCents: 1_000,
    });
  });

  it("imports a supplier's cwt price over the card's $/lb", async () => {
    const t = await setupTenant();
    const row = await json<MaterialDto>(
      api(t.path("/rate-card/materials"), {
        method: "POST",
        as: t.userId,
        json: { name: "A36 plate", pricingBasis: "per_lb", pricePerLbCents: 425 },
      }),
      201,
    );
    await json(
      api(t.path("/rate-card/import"), {
        method: "POST",
        as: t.userId,
        json: {
          kind: "materials",
          rows: [{ row: 2, values: { name: "A36 plate", pricePerCwtCents: 41_250 } }],
        },
      }),
    );
    const card = await json<RateCardDto>(api(t.path("/rate-card"), { as: t.userId }));
    expect(card.materials.find((x) => x.id === row.id)).toMatchObject({
      pricingBasis: "per_lb",
      pricePerLbCents: null,
      pricePerCwtCents: 41_250,
    });
    const history = await json<MaterialPriceHistoryDto>(
      api(t.path(`/rate-card/materials/${row.id}/prices`), { as: t.userId }),
    );
    expect(history.entries[0]).toMatchObject({
      source: "import",
      pricePerLbCents: null,
      pricePerCwtCents: 41_250,
    });
  });
});
