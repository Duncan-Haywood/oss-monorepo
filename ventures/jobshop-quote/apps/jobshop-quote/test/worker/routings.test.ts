// Routing templates (services/routings): save a line's operations and finishing under a name, list,
// edit and delete them; ids must be on the shop's own card; one name per shop; viewers can read but
// not write; another shop's routings are a 404. Applying a routing is a normal line save, priced
// from today's rate card.
import type { QuoteDetailDto } from "@shared/api";
import { applyRouting, type RoutingDto } from "@shared/routings";
import { describe, expect, it } from "vitest";
import { addMember, api, json, seedRateCard, setupTenant } from "./helpers";

const mill = (machineId: string) => ({
  machineId,
  label: "Op 10 mill",
  setupMinutes: 60,
  cycleMinutesPerPart: 12,
});

describe("routing templates", () => {
  it("saves, lists, edits, applies and deletes a routing", async () => {
    const t = await setupTenant();
    const rates = await seedRateCard(t);
    const created = await json<RoutingDto>(
      api(t.path("/routings"), {
        method: "POST",
        as: t.userId,
        json: {
          name: " 6061 bracket ",
          partFamily: "Brackets",
          operations: [mill(rates.mill)],
          finishing: [{ opId: rates.anodize }, { opId: rates.anodize }],
        },
      }),
      201,
    );
    expect(created).toMatchObject({
      name: "6061 bracket",
      partFamily: "Brackets",
      operations: [{ ...mill(rates.mill), machine: "Haas VF-2", retired: false }],
      finishing: [{ opId: rates.anodize, name: "Anodize Type II black", retired: false }],
    });

    // Same name in another case: 409.
    const dup = await api(t.path("/routings"), {
      method: "POST",
      as: t.userId,
      json: { name: "6061 BRACKET", operations: [mill(rates.mill)] },
    });
    expect(dup.status).toBe(409);

    const patched = await json<RoutingDto>(
      api(t.path(`/routings/${created.id}`), {
        method: "PATCH",
        as: t.userId,
        json: { name: "6061 bracket, anodized", finishing: [] },
      }),
    );
    expect(patched.name).toBe("6061 bracket, anodized");
    expect(patched.finishing).toEqual([]);
    expect(patched.operations).toHaveLength(1);

    // Editing in place with the updatedAt the editor loaded: operations change, the id stays.
    const edited = await json<RoutingDto>(
      api(t.path(`/routings/${created.id}`), {
        method: "PATCH",
        as: t.userId,
        json: {
          operations: [{ ...mill(rates.mill), cycleMinutesPerPart: 10 }, mill(rates.mill)],
          ifUpdatedAt: patched.updatedAt,
        },
      }),
    );
    expect(edited.id).toBe(created.id);
    expect(edited.operations.map((o) => o.cycleMinutesPerPart)).toEqual([10, 12]);
    // A second editor still holding the older copy is refused, not silently applied.
    const stale = await api(t.path(`/routings/${created.id}`), {
      method: "PATCH",
      as: t.userId,
      json: { name: "Stale edit", ifUpdatedAt: "2000-01-01T00:00:00.000Z" },
    });
    expect(stale.status).toBe(409);
    // Back to one operation for the rest of the test.
    await json(
      api(t.path(`/routings/${created.id}`), {
        method: "PATCH",
        as: t.userId,
        json: { operations: [mill(rates.mill)] },
      }),
    );

    const list = await json<{ items: RoutingDto[] }>(api(t.path("/routings"), { as: t.userId }));
    expect(list.items.map((r) => r.id)).toEqual([created.id]);

    // Applying it to a line, then saving: priced from the card like any edit.
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
          partNumber: "BRK-2001",
          inputs: { quantities: [10], customerSuppliedMaterial: true, material: null },
        },
      }),
      201,
    );
    const line = withLine.lines.at(-1);
    if (!line) throw new Error("no line");
    expect(line.breaks).toBeNull(); // no operations yet
    const applied = applyRouting(line.inputs, patched, "replace");
    if (!applied.ok) throw new Error(applied.message);
    const saved = await json<QuoteDetailDto>(
      api(t.path(`/quotes/${q.id}/lines/${line.id}`), {
        method: "PATCH",
        as: t.userId,
        json: { inputs: applied.inputs },
      }),
    );
    const priced = saved.lines.find((l) => l.id === line.id);
    // 60 min setup at $95/h = $95.00, 12 min x 10 parts at $95/h = $190.00; no markup on this card.
    expect(priced?.breaks?.[0]).toMatchObject({
      quantity: 10,
      setupCents: 9_500,
      runCents: 19_000,
    });
    expect(priced?.inputs.operations).toEqual([mill(rates.mill)]);

    await json(api(t.path(`/routings/${created.id}`), { method: "DELETE", as: t.userId }));
    const after = await json<{ items: RoutingDto[] }>(api(t.path("/routings"), { as: t.userId }));
    expect(after.items).toEqual([]);
    const again = await api(t.path(`/routings/${created.id}`), { method: "DELETE", as: t.userId });
    expect(again.status).toBe(404);
  });

  it("rejects ids that are not on the shop's own card and flags retired machines", async () => {
    const a = await setupTenant();
    const b = await setupTenant();
    const ratesA = await seedRateCard(a);
    const ratesB = await seedRateCard(b);

    // B's machine id under A: refused, never stored.
    const foreign = await api(a.path("/routings"), {
      method: "POST",
      as: a.userId,
      json: { name: "Borrowed", operations: [mill(ratesB.mill)] },
    });
    expect(foreign.status).toBe(400);
    const foreignFinish = await api(a.path("/routings"), {
      method: "POST",
      as: a.userId,
      json: {
        name: "Borrowed",
        operations: [mill(ratesA.mill)],
        finishing: [{ opId: ratesB.anodize }],
      },
    });
    expect(foreignFinish.status).toBe(400);
    // Prices are not part of a routing: unknown keys are refused.
    const priced = await api(a.path("/routings"), {
      method: "POST",
      as: a.userId,
      json: { name: "Priced", operations: [mill(ratesA.mill)], unitPriceCents: 100 },
    });
    expect(priced.status).toBe(400);

    const r = await json<RoutingDto>(
      api(a.path("/routings"), {
        method: "POST",
        as: a.userId,
        json: { name: "Mill only", operations: [mill(ratesA.mill)] },
      }),
      201,
    );
    await api(a.path(`/rate-card/machines/${ratesA.mill}`), { method: "DELETE", as: a.userId });
    const list = await json<{ items: RoutingDto[] }>(api(a.path("/routings"), { as: a.userId }));
    expect(list.items[0]?.operations[0]).toMatchObject({ machine: "Haas VF-2", retired: true });

    // B cannot see, edit or delete A's routing, on A's path or on its own.
    expect((await api(a.path("/routings"), { as: b.userId })).status).toBe(404);
    const bList = await json<{ items: RoutingDto[] }>(api(b.path("/routings"), { as: b.userId }));
    expect(bList.items).toEqual([]);
    for (const init of [
      { method: "PATCH", json: { name: "Mine now" } },
      { method: "DELETE" },
    ] as const) {
      expect((await api(b.path(`/routings/${r.id}`), { ...init, as: b.userId })).status).toBe(404);
      expect((await api(a.path(`/routings/${r.id}`), { ...init, as: b.userId })).status).toBe(404);
    }
    const still = await json<{ items: RoutingDto[] }>(api(a.path("/routings"), { as: a.userId }));
    expect(still.items.map((x) => x.name)).toEqual(["Mill only"]);
  });

  it("lets viewers list routings but not write them", async () => {
    const t = await setupTenant();
    const rates = await seedRateCard(t);
    const viewer = await addMember(t.orgId, "viewer");
    const r = await json<RoutingDto>(
      api(t.path("/routings"), {
        method: "POST",
        as: t.userId,
        json: { name: "Mill only", operations: [mill(rates.mill)] },
      }),
      201,
    );
    const list = await json<{ items: RoutingDto[] }>(api(t.path("/routings"), { as: viewer }));
    expect(list.items).toHaveLength(1);
    const writes = [
      api(t.path("/routings"), {
        method: "POST",
        as: viewer,
        json: { name: "Other", operations: [mill(rates.mill)] },
      }),
      api(t.path(`/routings/${r.id}`), { method: "PATCH", as: viewer, json: { name: "x" } }),
      api(t.path(`/routings/${r.id}`), { method: "DELETE", as: viewer }),
    ];
    for (const res of await Promise.all(writes)) expect(res.status).toBe(403);
  });
});
