// Repeat parts, part 2 (services/quotes/history.ts, createQuote): the RFQ review screen lists each
// part's earlier quotes, and a shop that opts in gets new quote lines pre-filled from the last won
// quote of the same part number and revision, priced from today's rate card. Never across shops.
import type { QuoteDetailDto, RfqDetailDto, RfqPartHistoryDto } from "@shared/api";
import type { CostInputs } from "@shared/costing";
import { describe, expect, it } from "vitest";
import { addMember, api, json, seedRateCard, setupTenant } from "./helpers";

type Tenant = Awaited<ReturnType<typeof setupTenant>>;
type Rates = Awaited<ReturnType<typeof seedRateCard>>;

const millOps = (rates: Rates, cycle: number): Partial<CostInputs> => ({
  customerSuppliedMaterial: true,
  material: null,
  operations: [
    { machineId: rates.mill, label: "OP10 mill", setupMinutes: 45, cycleMinutesPerPart: cycle },
  ],
  finishing: [{ opId: rates.anodize }],
});

/** A quote with one line, sent and then marked won or lost. */
async function decidedQuote(
  t: Tenant,
  line: { partNumber: string; revision: string | null; inputs: Partial<CostInputs> },
  outcome: { outcome: "won"; poNumber: string } | { outcome: "lost"; reason: string },
) {
  const q = await json<QuoteDetailDto>(
    api(t.path("/quotes"), { method: "POST", as: t.userId, json: { customerCompany: "Acme" } }),
    201,
  );
  const withLine = await json<QuoteDetailDto>(
    api(t.path(`/quotes/${q.id}/lines`), {
      method: "POST",
      as: t.userId,
      json: { ...line, inputs: { quantities: [10], ...line.inputs } },
    }),
    201,
  );
  await json(api(t.path(`/quotes/${q.id}/send`), { method: "POST", as: t.userId }));
  await json(
    api(t.path(`/quotes/${q.id}/outcome`), { method: "POST", as: t.userId, json: outcome }),
  );
  const l = withLine.lines.at(-1);
  if (!l) throw new Error("no line");
  return { quote: withLine, line: l };
}

/** An RFQ with hand-entered, confirmed parts. */
async function rfqWithParts(
  t: Tenant,
  parts: { partNumber: string | null; revision: string | null; quantities: number[] }[],
) {
  const rfq = await json<RfqDetailDto>(
    api(t.path("/rfqs"), { method: "POST", as: t.userId, json: { bodyText: "Please quote." } }),
    201,
  );
  let d = rfq;
  for (const p of parts) {
    d = await json<RfqDetailDto>(
      api(t.path(`/rfqs/${rfq.id}/parts`), {
        method: "POST",
        as: t.userId,
        json: { ...p, confirmed: true },
      }),
      201,
    );
  }
  return d;
}

const setPrefill = (t: Tenant, on: boolean) =>
  json(
    api(t.path("/settings"), {
      method: "PATCH",
      as: t.userId,
      json: { prefillRepeatParts: on },
    }),
  );

const quoteFor = (t: Tenant, rfqId: string) =>
  json<QuoteDetailDto>(
    api(t.path("/quotes"), { method: "POST", as: t.userId, json: { rfqId } }),
    201,
  );

describe("repeat parts, part 2", () => {
  it("lists each RFQ part's earlier quotes before a quote exists", async () => {
    const t = await setupTenant();
    const rates = await seedRateCard(t);
    const won = await decidedQuote(
      t,
      { partNumber: "BRK-1001", revision: "B", inputs: millOps(rates, 6) },
      { outcome: "won", poNumber: "PO-1" },
    );
    await decidedQuote(
      t,
      { partNumber: "brk-1001 ", revision: "A", inputs: millOps(rates, 7) },
      { outcome: "lost", reason: "price" },
    );
    const rfq = await rfqWithParts(t, [
      { partNumber: "BRK-1001", revision: "B", quantities: [25] },
      { partNumber: "NEW-9", revision: null, quantities: [5] },
      { partNumber: null, revision: null, quantities: [1] },
    ]);
    const h = await json<RfqPartHistoryDto>(
      api(t.path(`/rfqs/${rfq.id}/part-history`), { as: t.userId }),
    );
    // Parts with no part number are left out; a part never quoted has an empty list.
    expect(h.parts.map((p) => [p.partNumber, p.items.length])).toEqual([
      ["BRK-1001", 2],
      ["NEW-9", 0],
    ]);
    const brk = h.parts[0];
    expect(brk?.rfqPartId).toBe(rfq.parts[0]?.id);
    const wonItem = brk?.items.find((i) => i.status === "won");
    expect(wonItem).toMatchObject({ lineId: won.line.id, sameRevision: true, poNumber: "PO-1" });
    expect(brk?.items.find((i) => i.status === "lost")).toMatchObject({
      sameRevision: false,
      lostReason: "price",
    });
    // Viewers can read it too.
    const viewer = await addMember(t.orgId, "viewer");
    const asViewer = await api(t.path(`/rfqs/${rfq.id}/part-history`), { as: viewer });
    expect(asViewer.status).toBe(200);
  });

  it("is off by default: a new quote starts from the RFQ, not the won quote", async () => {
    const t = await setupTenant();
    const rates = await seedRateCard(t);
    await decidedQuote(
      t,
      { partNumber: "BRK-1001", revision: "B", inputs: millOps(rates, 6) },
      { outcome: "won", poNumber: "PO-1" },
    );
    const rfq = await rfqWithParts(t, [
      { partNumber: "BRK-1001", revision: "B", quantities: [25] },
    ]);
    const q = await quoteFor(t, rfq.id);
    expect(q.lines[0]?.prefilledFrom).toBeNull();
    expect(q.lines[0]?.inputs.operations).toEqual([]);
  });

  it("pre-fills from the last won quote of the same revision, at today's rates and the RFQ's quantities", async () => {
    const t = await setupTenant();
    const rates = await seedRateCard(t);
    await setPrefill(t, true);
    const first = await decidedQuote(
      t,
      { partNumber: "BRK-1001", revision: "B", inputs: millOps(rates, 6) },
      { outcome: "won", poNumber: "PO-1" },
    );
    const last = await decidedQuote(
      t,
      { partNumber: "BRK-1001", revision: "B", inputs: millOps(rates, 5) },
      { outcome: "won", poNumber: "PO-2" },
    );
    // A later loss and a won quote of another revision never pre-fill.
    await decidedQuote(
      t,
      { partNumber: "BRK-1001", revision: "B", inputs: millOps(rates, 3) },
      { outcome: "lost", reason: "price" },
    );
    await decidedQuote(
      t,
      { partNumber: "BRK-1001", revision: "C", inputs: millOps(rates, 2) },
      { outcome: "won", poNumber: "PO-3" },
    );
    expect(first.line.id).not.toBe(last.line.id);
    // Rates went up since.
    await json(
      api(t.path(`/rate-card/machines/${rates.mill}`), {
        method: "PATCH",
        as: t.userId,
        json: { hourlyRateCents: 12_000 },
      }),
    );
    const rfq = await rfqWithParts(t, [
      { partNumber: " brk-1001", revision: "b", quantities: [25, 100] },
      { partNumber: "BRK-1001", revision: null, quantities: [5] },
      { partNumber: "NEW-9", revision: null, quantities: [5] },
    ]);
    const q = await quoteFor(t, rfq.id);
    const [same, noRev, fresh] = q.lines;
    expect(same?.prefilledFrom).toMatchObject({
      lineId: last.line.id,
      quoteId: last.quote.id,
      quoteNumber: last.quote.quoteNumber,
      revNumber: 1,
      customerCompany: "Acme",
    });
    expect(same?.prefilledFrom?.wonOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(same?.partNumber).toBe("brk-1001");
    expect(same?.revision).toBe("b");
    expect(same?.inputs.quantities).toEqual([25, 100]);
    expect(same?.inputs.operations[0]?.cycleMinutesPerPart).toBe(5);
    expect(same?.inputs.finishing).toEqual([{ opId: rates.anodize }]);
    expect(same?.breaks?.map((b) => b.quantity)).toEqual([25, 100]);
    expect(same?.snapshot?.machines.find((m) => m.id === rates.mill)?.hourlyRateCents).toBe(12_000);
    // A part with no revision does not take a revision-B quote; a new part has nothing to take.
    expect(noRev?.prefilledFrom).toBeNull();
    expect(noRev?.inputs.operations).toEqual([]);
    expect(fresh?.prefilledFrom).toBeNull();

    // A revision of the new quote keeps the label (the unpriced lines go first so it can be sent).
    for (const l of [noRev, fresh]) {
      await json(api(t.path(`/quotes/${q.id}/lines/${l?.id}`), { method: "DELETE", as: t.userId }));
    }
    await json(api(t.path(`/quotes/${q.id}/send`), { method: "POST", as: t.userId }));
    const rev = await json<QuoteDetailDto>(
      api(t.path(`/quotes/${q.id}/revise`), { method: "POST", as: t.userId }),
      201,
    );
    expect(rev.lines[0]?.prefilledFrom?.lineId).toBe(last.line.id);
  });

  it("never pre-fills from or lists another shop's quotes", async () => {
    const a = await setupTenant();
    const b = await setupTenant();
    const ra = await seedRateCard(a);
    await seedRateCard(b);
    await decidedQuote(
      a,
      { partNumber: "SHARED-1", revision: null, inputs: millOps(ra, 6) },
      { outcome: "won", poNumber: "PO-A" },
    );
    await setPrefill(b, true);
    const rfqB = await rfqWithParts(b, [
      { partNumber: "SHARED-1", revision: null, quantities: [5] },
    ]);
    const hb = await json<RfqPartHistoryDto>(
      api(b.path(`/rfqs/${rfqB.id}/part-history`), { as: b.userId }),
    );
    expect(hb.parts[0]?.items).toEqual([]);
    const qb = await quoteFor(b, rfqB.id);
    expect(qb.lines[0]?.prefilledFrom).toBeNull();
    // B's member cannot read B's RFQ through A's path, nor A's RFQ at all.
    const peek = await api(a.path(`/rfqs/${rfqB.id}/part-history`), { as: b.userId });
    expect(peek.status).toBe(404);
    const rfqA = await rfqWithParts(a, [
      { partNumber: "SHARED-1", revision: null, quantities: [5] },
    ]);
    const wrongOrg = await api(b.path(`/rfqs/${rfqA.id}/part-history`), { as: b.userId });
    expect(wrongOrg.status).toBe(404);
  });

  it("pre-fills past the 50 part numbers one lookup query takes", async () => {
    const t = await setupTenant();
    const rates = await seedRateCard(t);
    await setPrefill(t, true);
    await decidedQuote(
      t,
      { partNumber: "P-55", revision: null, inputs: millOps(rates, 4) },
      { outcome: "won", poNumber: "PO-55" },
    );
    const parts = Array.from({ length: 60 }, (_, i) => ({
      partNumber: `P-${i + 1}`,
      revision: null,
      quantities: [5],
    }));
    const rfq = await rfqWithParts(t, parts);
    const q = await quoteFor(t, rfq.id);
    expect(q.lines).toHaveLength(60);
    const filled = q.lines.filter((l) => l.prefilledFrom);
    expect(filled.map((l) => l.partNumber)).toEqual(["P-55"]);
  });

  it("only an admin turns pre-fill on", async () => {
    const t = await setupTenant();
    const est = await addMember(t.orgId, "estimator");
    const r = await api(t.path("/settings"), {
      method: "PATCH",
      as: est,
      json: { prefillRepeatParts: true },
    });
    expect(r.status).toBe(403);
    const card = await json<{ settings: { prefillRepeatParts: boolean } }>(
      api(t.path("/rate-card"), { as: t.userId }),
    );
    expect(card.settings.prefillRepeatParts).toBe(false);
  });
});
