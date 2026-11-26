// Win/loss analytics (services/quotes/analytics.ts): the shop's decided quotes by customer,
// material, machine and markup, and what each repeat part was won and lost at. Never across shops.
import type { QuoteDetailDto, WinLossDto } from "@shared/api";
import type { CostInputs } from "@shared/costing";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { quotes } from "../../src/worker/db/schema";
import { addMember, api, json, seedRateCard, setupTenant, testDb } from "./helpers";

type Tenant = Awaited<ReturnType<typeof setupTenant>>;

async function decidedQuote(
  t: Tenant,
  customerCompany: string,
  partNumber: string,
  inputs: Partial<CostInputs>,
  outcome: { outcome: "won"; poNumber?: string } | { outcome: "lost"; reason?: string },
) {
  const q = await json<QuoteDetailDto>(
    api(t.path("/quotes"), { method: "POST", as: t.userId, json: { customerCompany } }),
    201,
  );
  await json(
    api(t.path(`/quotes/${q.id}/lines`), {
      method: "POST",
      as: t.userId,
      json: { partNumber, revision: "A", inputs },
    }),
    201,
  );
  await json(api(t.path(`/quotes/${q.id}/send`), { method: "POST", as: t.userId }));
  await json(
    api(t.path(`/quotes/${q.id}/outcome`), { method: "POST", as: t.userId, json: outcome }),
  );
  return q.id;
}

const report = (t: Tenant, query = "", as = t.userId) =>
  json<WinLossDto>(api(t.path(`/quotes/analytics${query}`), { as }));

describe("win/loss analytics", () => {
  it("reports win rate by customer, material and machine, and the prices each part went at", async () => {
    const t = await setupTenant();
    const r = await seedRateCard(t);
    const milled: Partial<CostInputs> = {
      quantities: [10, 50],
      material: { materialId: r.al, blank: { shape: "weight", weightLb: 2 }, partsPerStock: null },
      operations: [{ machineId: r.mill, label: "OP10", setupMinutes: 60, cycleMinutesPerPart: 12 }],
    };
    await decidedQuote(t, "Example Robotics LLC", "BRK-1001", milled, {
      outcome: "won",
      poNumber: "PO-1",
    });
    await decidedQuote(t, "example robotics llc", "BRK-1001", milled, {
      outcome: "lost",
      reason: "Price",
    });
    await decidedQuote(
      t,
      "Sample Aero Inc",
      "SPC-220",
      { ...milled, material: null, customerSuppliedMaterial: true },
      { outcome: "lost", reason: "Lead time" },
    );
    // A draft never counts.
    await json(
      api(t.path("/quotes"), {
        method: "POST",
        as: t.userId,
        json: { customerCompany: "Draft Co" },
      }),
      201,
    );

    const w = await report(t);
    expect(w.window).toBe("365");
    expect(w.truncated).toBe(false);
    expect(w.totals).toMatchObject({ won: 1, lost: 2, decided: 3, lowSample: true });
    // One row for both spellings, named as the newest decision spelled it.
    expect(w.byCustomer.map((c) => [c.label, c.won, c.lost])).toEqual([
      ["example robotics llc", 1, 1],
      ["Sample Aero Inc", 0, 1],
    ]);
    expect(Object.fromEntries(w.byMaterial.map((m) => [m.label, [m.won, m.lost]]))).toEqual({
      "Aluminum 6061-T6 plate": [1, 1],
      "Customer-supplied": [0, 1],
    });
    expect(w.byMachine.map((m) => [m.label, m.won, m.lost])).toEqual([["Haas VF-2", 1, 2]]);
    expect(w.markupWonBps).not.toBeNull();
    expect(w.byMarkup.reduce((s, b) => s + b.decided, 0)).toBe(3);
    expect(w.lostReasons.map((x) => x.reason).sort()).toEqual(["Lead time", "Price"]);
    const brk = w.prices.find((p) => p.partNumber === "BRK-1001");
    expect(brk).toMatchObject({ won: 1, lost: 1 });
    expect(brk?.entries[0]?.breaks.map((b) => b.quantity)).toEqual([10, 50]);
    expect(brk?.entries[0]?.breaks[0]?.unitPriceCents).toBeGreaterThan(0);
  });

  it("limits the report to the chosen window and rejects unknown windows", async () => {
    const t = await setupTenant();
    const r = await seedRateCard(t);
    const inputs: Partial<CostInputs> = {
      quantities: [5],
      customerSuppliedMaterial: true,
      material: null,
      operations: [{ machineId: r.mill, label: "", setupMinutes: 30, cycleMinutesPerPart: 5 }],
    };
    const old = await decidedQuote(t, "Old Customer", "OLD-1", inputs, { outcome: "won" });
    await decidedQuote(t, "New Customer", "NEW-1", inputs, { outcome: "won" });
    await testDb()
      .update(quotes)
      .set({ decidedAt: new Date(Date.now() - 200 * 86_400_000) })
      .where(eq(quotes.id, old));

    expect((await report(t, "?window=90")).byCustomer.map((c) => c.label)).toEqual([
      "New Customer",
    ]);
    expect((await report(t, "?window=365")).totals.won).toBe(2);
    expect((await report(t, "?window=all")).totals.won).toBe(2);
    const bad = await api(t.path("/quotes/analytics?window=7"), { as: t.userId });
    expect(bad.status).toBe(400);
  });

  it("never shows another shop's quotes; viewers can read it", async () => {
    const a = await setupTenant();
    const b = await setupTenant();
    const r = await seedRateCard(a);
    await decidedQuote(
      a,
      "Example Robotics LLC",
      "BRK-1001",
      {
        quantities: [5],
        customerSuppliedMaterial: true,
        material: null,
        operations: [{ machineId: r.mill, label: "", setupMinutes: 30, cycleMinutesPerPart: 5 }],
      },
      { outcome: "won" },
    );
    const theirs = await report(b);
    expect(theirs.quoteCount).toBe(0);
    expect(theirs.prices).toEqual([]);
    // B's user asking for A's org is refused outright.
    const cross = await api(a.path("/quotes/analytics"), { as: b.userId });
    expect([403, 404]).toContain(cross.status);

    const viewer = await addMember(a.orgId, "viewer");
    expect((await report(a, "", viewer)).totals.won).toBe(1);
  });

  it("splits by estimator and month, and exports the same quotes as CSV", async () => {
    const t = await setupTenant();
    const r = await seedRateCard(t);
    const inputs: Partial<CostInputs> = {
      quantities: [5],
      customerSuppliedMaterial: true,
      material: null,
      operations: [{ machineId: r.mill, label: "", setupMinutes: 30, cycleMinutesPerPart: 5 }],
    };
    const estimator = await addMember(t.orgId, "estimator");
    const mine = await decidedQuote(t, "Example Robotics LLC", "BRK-1", inputs, { outcome: "won" });
    const theirs = await decidedQuote(
      { ...t, userId: estimator },
      "=cmd|' /C calc'!A0",
      "SPC-2",
      inputs,
      { outcome: "lost", reason: "Price" },
    );
    const now = Date.now();
    await testDb()
      .update(quotes)
      .set({ decidedAt: new Date(now - 40 * 86_400_000) })
      .where(eq(quotes.id, theirs));

    const w = await report(t);
    expect(w.byEstimator.map((e) => [e.won, e.lost])).toEqual([
      [1, 0],
      [0, 1],
    ]);
    expect(w.byEstimator.every((e) => e.label === "Test User")).toBe(true);
    expect(w.byMonth.length).toBeGreaterThanOrEqual(2);
    expect(w.byMonth.reduce((s, m) => s + m.decided, 0)).toBe(2);
    expect(w.byMonth[w.byMonth.length - 1]?.won).toBe(1);

    const res = await api(t.path("/quotes/analytics.csv?window=365"), { as: t.userId });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
    expect(res.headers.get("content-disposition")).toMatch(/^attachment; filename="win-loss-365-/);
    // Response.text() drops a BOM, so read the bytes: Excel needs it to open the file as UTF-8.
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const rows = new TextDecoder().decode(bytes).trim().split("\r\n");
    expect(rows).toHaveLength(3);
    expect(rows[1]).toMatch(/^Q-\d+,Example Robotics LLC,Test User,won,/);
    // The customer name a spreadsheet would run is written as text.
    expect(rows[2]).toContain(",'=cmd|' /C calc'!A0,Test User,lost,");
    // No saved routings in this shop: the Routings cell is blank.
    expect(rows[2]).toMatch(/,Price,SPC-2,$/);
    expect(mine).toBeTruthy();

    // The window applies, a bad window is refused, and another shop gets only the header.
    const short = await (
      await api(t.path("/quotes/analytics.csv?window=90"), { as: t.userId })
    ).text();
    expect(short.trim().split("\r\n")).toHaveLength(3);
    expect((await api(t.path("/quotes/analytics.csv?window=7"), { as: t.userId })).status).toBe(
      400,
    );
    const other = await setupTenant();
    const cross = await api(t.path("/quotes/analytics.csv"), { as: other.userId });
    expect([403, 404]).toContain(cross.status);
    const empty = await (
      await api(other.path("/quotes/analytics.csv"), { as: other.userId })
    ).text();
    expect(empty.trim().split("\r\n")).toHaveLength(1);
  });

  it("splits by the shop's saved routings and part families, never another shop's", async () => {
    const t = await setupTenant();
    const r = await seedRateCard(t);
    const mill = { machineId: r.mill, label: "OP10", setupMinutes: 60, cycleMinutesPerPart: 12 };
    const milled: Partial<CostInputs> = {
      quantities: [10],
      material: { materialId: r.al, blank: { shape: "weight", weightLb: 2 }, partsPerStock: null },
      operations: [mill],
    };
    const save = (who: Tenant, name: string, partFamily: string | null) =>
      json(
        api(who.path("/routings"), {
          method: "POST",
          as: who.userId,
          json: { name, partFamily, operations: [mill], finishing: [] },
        }),
        201,
      );
    await save(t, "Milled bracket", "Brackets");
    await decidedQuote(t, "Example Robotics LLC", "BRK-1", milled, { outcome: "won" });
    await decidedQuote(t, "Example Robotics LLC", "BRK-2", milled, { outcome: "lost" });
    await decidedQuote(
      t,
      "Sample Aero Inc",
      "SPC-1",
      { ...milled, operations: [{ ...mill, label: "OP20 drill" }] },
      { outcome: "won" },
    );

    const rep = await report(t);
    expect(rep.byRouting.map((x) => [x.label, x.won, x.lost])).toEqual([
      ["Milled bracket", 1, 1],
      ["No saved routing", 1, 0],
    ]);
    expect(rep.byPartFamily.map((x) => [x.label, x.won, x.lost])).toEqual([["Brackets", 1, 1]]);
    const csv = await (await api(t.path("/quotes/analytics.csv"), { as: t.userId })).text();
    expect(csv).toContain(",BRK-1,Milled bracket\r\n");

    // Another shop's routing with the same machine id and label is not this shop's.
    const other = await setupTenant();
    const rb = await seedRateCard(other);
    expect(rb.mill).not.toBe(r.mill);
    await json(
      api(other.path("/routings"), {
        method: "POST",
        as: other.userId,
        json: {
          name: "Their routing",
          partFamily: "Theirs",
          operations: [{ ...mill, machineId: rb.mill }],
          finishing: [],
        },
      }),
      201,
    );
    const again = await report(t);
    expect(again.byRouting.map((x) => x.label)).not.toContain("Their routing");
    expect(again.byPartFamily.map((x) => x.label)).toEqual(["Brackets"]);
    expect((await report(other)).byRouting).toEqual([]);
  });
});
