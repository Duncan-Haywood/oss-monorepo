// Routings, part 3 (shared/routing-suggest.ts, services/routings): GET /routings/suggestions ranks a
// shop's routings for a line from that shop's own earlier lines and the line's description. Never
// another shop's routings or lines; the line being edited is not its own evidence; viewers may read.
import type { QuoteDetailDto } from "@shared/api";
import type { CostInputs } from "@shared/costing";
import type { RoutingSuggestionsDto } from "@shared/routing-suggest";
import type { RoutingDto } from "@shared/routings";
import { describe, expect, it } from "vitest";
import { addMember, api, json, seedRateCard, setupTenant } from "./helpers";

type Tenant = Awaited<ReturnType<typeof setupTenant>>;

const millOp = (machineId: string, cycleMinutesPerPart = 12) => ({
  machineId,
  label: "Op 10 mill",
  setupMinutes: 60,
  cycleMinutesPerPart,
});

async function quoteWithLine(
  t: Tenant,
  line: { partNumber: string; description?: string; inputs: Partial<CostInputs> },
) {
  const q = await json<QuoteDetailDto>(
    api(t.path("/quotes"), {
      method: "POST",
      as: t.userId,
      json: { customerCompany: "Example Robotics LLC" },
    }),
    201,
  );
  const withLine = await json<QuoteDetailDto>(
    api(t.path(`/quotes/${q.id}/lines`), {
      method: "POST",
      as: t.userId,
      json: {
        partNumber: line.partNumber,
        description: line.description ?? null,
        inputs: line.inputs,
      },
    }),
    201,
  );
  const added = withLine.lines.at(-1);
  if (!added) throw new Error("no line");
  return { quote: withLine, line: added };
}

const suggest = (t: Tenant, q: Record<string, string>, as = t.userId) =>
  json<RoutingSuggestionsDto>(
    api(t.path(`/routings/suggestions?${new URLSearchParams(q)}`), { as }),
  );

describe("routing suggestions", () => {
  it("ranks routings from the shop's own lines and the description", async () => {
    const t = await setupTenant();
    const rates = await seedRateCard(t);
    const routing = (name: string, partFamily: string | null, operations: unknown[]) =>
      json<RoutingDto>(
        api(t.path("/routings"), {
          method: "POST",
          as: t.userId,
          json: { name, partFamily, operations, finishing: [] },
        }),
        201,
      );
    const bracket = await routing("Plate bracket", null, [millOp(rates.mill)]);
    const shaft = await routing("Turned shaft", "Shafts", [
      { ...millOp(rates.mill), label: "Op 20 cross drill" },
    ]);
    await routing("Weldment", null, [{ ...millOp(rates.mill), label: "Op 30 weld prep" }]);

    const al = (cycle: number): Partial<CostInputs> => ({
      quantities: [10],
      material: {
        materialId: rates.al,
        blank: { shape: "weight", weightLb: 1 },
        partsPerStock: null,
      },
      operations: [millOp(rates.mill, cycle)],
    });
    // Won earlier: the bracket routing on aluminum, with a tuned cycle time (still counts).
    const won = await quoteWithLine(t, { partNumber: "BRK-1", inputs: al(9) });
    await json(api(t.path(`/quotes/${won.quote.id}/send`), { method: "POST", as: t.userId }));
    await json(
      api(t.path(`/quotes/${won.quote.id}/outcome`), {
        method: "POST",
        as: t.userId,
        json: { outcome: "won", poNumber: "PO-1" },
      }),
    );

    const now = await quoteWithLine(t, {
      partNumber: "SHF-9",
      description: "Drive shaft",
      inputs: {
        quantities: [5],
        material: {
          materialId: rates.al,
          blank: { shape: "weight", weightLb: 1 },
          partsPerStock: null,
        },
        operations: [millOp(rates.mill)],
      },
    });

    const s = await suggest(t, {
      materialId: rates.al,
      description: "Drive shaft",
      lineId: now.line.id,
    });
    // The current line (same ops, same material) is not counted: one won line, not two.
    expect(s.historyLines).toBe(1);
    expect(s.items.map((x) => [x.routingId, x.score])).toEqual([
      [bracket.id, 5], // 1 same-material line (3) + won (2)
      [shaft.id, 2], // "shaft" in its name
    ]);
    expect(s.items[0]).toMatchObject({ sameMaterialLines: 1, sameMaterialWon: 1 });

    // Without the line id, the line under edit counts as history too.
    const all = await suggest(t, { materialId: rates.al, description: "" });
    expect(all.items).toEqual([
      expect.objectContaining({ routingId: bracket.id, sameMaterialLines: 2 }),
    ]);

    // Viewers may read suggestions, like the routing list.
    const viewer = await addMember(t.orgId, "viewer");
    const v = await suggest(t, { description: "shaft" }, viewer);
    expect(v.items.map((x) => x.routingId)).toContain(shaft.id);

    // Another shop sees none of this shop's routings or lines.
    const other = await setupTenant();
    const o = await suggest(other, { materialId: rates.al, description: "Drive shaft" });
    expect(o).toEqual({ items: [], historyLines: 0 });
    // And cannot reach this shop's endpoint.
    const cross = await api(t.path("/routings/suggestions"), { as: other.userId });
    expect(cross.status).toBe(404);

    // Unknown query keys are refused.
    const bad = await api(t.path("/routings/suggestions?foo=1"), { as: t.userId });
    expect(bad.status).toBe(400);
  });
  it("counts lines in another row of the same alloy, retired rows too (part 4)", async () => {
    const t = await setupTenant();
    const rates = await seedRateCard(t);
    const bar = await json<{ id: string }>(
      api(t.path("/rate-card/materials"), {
        method: "POST",
        as: t.userId,
        json: {
          name: "6061 bar 1 in",
          pricingBasis: "per_lb",
          pricePerLbCents: 500,
          densityLbPerIn3: 0.0975,
        },
      }),
      201,
    );
    const bracket = await json<RoutingDto>(
      api(t.path("/routings"), {
        method: "POST",
        as: t.userId,
        json: {
          name: "Bracket",
          partFamily: null,
          operations: [millOp(rates.mill)],
          finishing: [],
        },
      }),
      201,
    );
    const inMaterial = (materialId: string): Partial<CostInputs> => ({
      quantities: [10],
      material: { materialId, blank: { shape: "weight", weightLb: 1 }, partsPerStock: null },
      operations: [millOp(rates.mill)],
    });
    await quoteWithLine(t, { partNumber: "B-1", inputs: inMaterial(bar.id) });
    await quoteWithLine(t, { partNumber: "B-2", inputs: inMaterial(rates.ss) });
    // The bar is retired after it was used: its old line is still evidence.
    const del = await api(t.path(`/rate-card/materials/${bar.id}`), {
      method: "DELETE",
      as: t.userId,
    });
    expect(del.ok).toBe(true);

    const s = await suggest(t, { materialId: rates.al, description: "" });
    expect(s.items).toEqual([
      expect.objectContaining({
        routingId: bracket.id,
        sameMaterialLines: 0,
        sameFamilyLines: 1,
        family: "6061",
        otherLines: 1,
        score: 3,
      }),
    ]);
    // Quoting in the stainless row, the aluminum bar is just another material.
    const ss = await suggest(t, { materialId: rates.ss, description: "" });
    expect(ss.items[0]).toMatchObject({ sameMaterialLines: 1, sameFamilyLines: 0, otherLines: 1 });
  });
});
