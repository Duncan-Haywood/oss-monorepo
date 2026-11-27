// Material priced by the foot through the Worker: the rate-card row (form route and spreadsheet
// import), D1 round trip, the costing preview pricing whole bars, and another shop never seeing it.
import type { MaterialDto, MaterialPriceHistoryDto, RateCardDto } from "@shared/api";
import { describe, expect, it } from "vitest";
import { addMember, api, json, setupTenant } from "./helpers";

type Tenant = Awaited<ReturnType<typeof setupTenant>>;
type Preview = {
  ok: boolean;
  result?: { breaks: { quantity: number; materialCents: number }[]; basis: string[] };
  issues?: { code: string }[];
};

async function lathe(t: Tenant) {
  return json<{ id: string }>(
    api(t.path("/rate-card/machines"), {
      method: "POST",
      as: t.userId,
      json: { name: "Okuma LB3000", kind: "lathe", hourlyRateCents: 11_000 },
    }),
    201,
  );
}

const inputs = (materialId: string, machineId: string, lengthIn = 2.875) => ({
  quantities: [10, 47, 48],
  customerSuppliedMaterial: false,
  material: { materialId, blank: { shape: "round", diameterIn: 1, lengthIn }, partsPerStock: null },
  operations: [{ machineId, label: "Turn", setupMinutes: 30, cycleMinutesPerPart: 2 }],
  finishing: [],
  extras: [],
});

const preview = (t: Tenant, body: unknown) =>
  json<Preview>(
    api(t.path("/costing/preview"), { method: "POST", as: t.userId, json: { inputs: body } }),
  );

describe("per-foot material", () => {
  it("saves a per-foot row and prices whole 12 ft bars", async () => {
    const t = await setupTenant();
    const m = await lathe(t);
    const row = await json<{ id: string }>(
      api(t.path("/rate-card/materials"), {
        method: "POST",
        as: t.userId,
        json: {
          name: "1018 CRS 1 in round",
          pricingBasis: "per_ft",
          pricePerFootCents: 420,
          cutAllowanceIn: 0.125,
          barLengthIn: 144,
          barRemnantIn: 3,
        },
      }),
      201,
    );
    const card = await json<RateCardDto>(api(t.path("/rate-card"), { as: t.userId }));
    expect(card.materials.find((x) => x.id === row.id)).toMatchObject({
      pricingBasis: "per_ft",
      pricePerFootCents: 420,
      cutAllowanceIn: 0.125,
      barLengthIn: 144,
      barRemnantIn: 3,
    });
    const p = await preview(t, inputs(row.id, m.id));
    expect(p.ok).toBe(true);
    // 3 in a part, 141 in usable a bar: 47 parts per bar; $50.40 a bar.
    expect(p.result?.breaks.map((b) => b.materialCents)).toEqual([5_040, 5_040, 10_080]);
    expect(p.result?.basis[0]).toMatch(/47 parts per bar, whole bars charged/);
    // A new price per foot is recorded in the price history and re-dates the price.
    const before = card.materials.find((x) => x.id === row.id) as MaterialDto;
    const { id: _id, priceSetAt: _at, ...fields } = before;
    await json<MaterialDto>(
      api(t.path(`/rate-card/materials/${row.id}`), {
        method: "PUT",
        as: t.userId,
        json: { ...fields, pricePerFootCents: 455 },
      }),
    );
    const history = await json<MaterialPriceHistoryDto>(
      api(t.path(`/rate-card/materials/${row.id}/prices`), { as: t.userId }),
    );
    expect(history.entries.map((e) => [e.source, e.pricePerFootCents])).toEqual([
      ["edit", 455],
      ["create", 420],
    ]);
    const repriced = await preview(t, inputs(row.id, m.id));
    expect(repriced.result?.breaks[0]?.materialCents).toBe(5_460);
    // A blank longer than the usable bar blocks the price instead of guessing.
    const long = await preview(t, inputs(row.id, m.id, 141));
    expect(long.ok).toBe(false);
    expect(long.issues?.map((i) => i.code)).toEqual(["material_bar_too_short"]);
  });

  it("edits a row's bar setup in place: the price, its date and history stay", async () => {
    const t = await setupTenant();
    const m = await lathe(t);
    const row = await json<MaterialDto>(
      api(t.path("/rate-card/materials"), {
        method: "POST",
        as: t.userId,
        json: {
          name: "1018 CRS 1 in round",
          pricingBasis: "per_ft",
          pricePerFootCents: 420,
          cutAllowanceIn: 0.125,
          barLengthIn: 144,
          barRemnantIn: 3,
        },
      }),
      201,
    );
    const { id, priceSetAt, ...fields } = row;
    // What the Bar setup form sends: the whole row with the setup fields changed.
    const setup = { ...fields, cutAllowanceIn: 0.1875, barLengthIn: 240, barRemnantIn: 4 };
    const put = (as: string, orgPath: (p: string) => string, body: unknown = setup) =>
      api(orgPath(`/rate-card/materials/${id}`), { method: "PUT", as, json: body });

    // An estimator cannot edit it, and another shop's admin cannot reach it.
    const estimator = await addMember(t.orgId, "estimator");
    expect((await put(estimator, t.path)).status).toBe(403);
    const other = await setupTenant();
    expect((await put(other.userId, other.path)).status).toBe(404);
    // A remnant as long as the bar is refused, nothing saved.
    expect((await put(t.userId, t.path, { ...setup, barRemnantIn: 240 })).status).toBe(400);

    const saved = await json<MaterialDto>(put(t.userId, t.path));
    expect([saved.cutAllowanceIn, saved.barLengthIn, saved.barRemnantIn]).toEqual([0.1875, 240, 4]);
    expect(saved.pricePerFootCents).toBe(420);
    expect(saved.priceSetAt).toBe(priceSetAt);
    const history = await json<MaterialPriceHistoryDto>(
      api(t.path(`/rate-card/materials/${id}/prices`), { as: t.userId }),
    );
    expect(history.entries.map((e) => e.source)).toEqual(["create"]);
    // 2.875 + 0.1875 = 3.0625 in a part, 236 in usable: 77 parts per bar at $4.20/ft x 20 ft.
    const p = await preview(t, inputs(id, m.id));
    expect(p.result?.basis[0]).toMatch(/77 parts per bar, whole bars charged/);
    expect(p.result?.breaks.map((b) => b.materialCents)).toEqual([8_400, 8_400, 8_400]);

    // Clearing the bar length charges by the length used and drops the remnant.
    const byLength = await json<MaterialDto>(
      put(t.userId, t.path, { ...setup, barLengthIn: null, barRemnantIn: null, scrapBps: 500 }),
    );
    expect([byLength.barLengthIn, byLength.barRemnantIn, byLength.scrapBps]).toEqual([
      null,
      null,
      500,
    ]);
    // The other shop's card never saw the row.
    const theirs = await json<RateCardDto>(api(other.path("/rate-card"), { as: other.userId }));
    expect(theirs.materials).toEqual([]);
  });

  it("refuses a per-foot row with no price per foot, or a remnant as long as the bar", async () => {
    const t = await setupTenant();
    const post = (body: unknown) =>
      api(t.path("/rate-card/materials"), { method: "POST", as: t.userId, json: body });
    expect((await post({ name: "Hex", pricingBasis: "per_ft" })).status).toBe(400);
    expect(
      (
        await post({
          name: "Hex",
          pricingBasis: "per_ft",
          pricePerFootCents: 900,
          barLengthIn: 144,
          barRemnantIn: 144,
        })
      ).status,
    ).toBe(400);
  });

  it("imports a supplier's per-foot price list, and another shop cannot price from it", async () => {
    const a = await setupTenant();
    const b = await setupTenant();
    const res = await json<{ created: number; updated: number }>(
      api(a.path("/rate-card/import"), {
        method: "POST",
        as: a.userId,
        json: {
          kind: "materials",
          rows: [
            {
              row: 2,
              values: {
                name: "6061-T6511 1.5 in round",
                pricingBasis: "per_ft",
                pricePerFootCents: 785,
                barLengthIn: 144,
                cutAllowanceIn: 0.0625,
              },
            },
          ],
        },
      }),
    );
    expect(res).toEqual({ created: 1, updated: 0 });
    const card = await json<RateCardDto>(api(a.path("/rate-card"), { as: a.userId }));
    const row = card.materials.find((x) => x.name === "6061-T6511 1.5 in round");
    expect(row).toMatchObject({ pricePerFootCents: 785, barLengthIn: 144, barRemnantIn: null });
    const mb = await lathe(b);
    const cross = await preview(b, inputs(row?.id ?? "", mb.id));
    expect(cross.ok).toBe(false);
    expect(cross.issues?.map((i) => i.code)).toEqual(["unknown_material"]);
  });
});
