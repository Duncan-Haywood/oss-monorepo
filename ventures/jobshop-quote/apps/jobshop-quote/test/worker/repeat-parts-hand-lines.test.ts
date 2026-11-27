// Repeat parts, part 3 (services/quotes addLine/updateLine): a line added by hand to a quote, once
// it gets a part number the shop has won before, starts from the last won line of that part number
// and revision, like a line made from an RFQ. Opt-in per shop, never over typed inputs, never
// across shops, and priced from today's rate card with this line's quantities.
import type { QuoteDetailDto } from "@shared/api";
import type { CostInputs } from "@shared/costing";
import { describe, expect, it } from "vitest";
import { api, json, seedRateCard, setupTenant } from "./helpers";

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

const newQuote = (t: Tenant) =>
  json<QuoteDetailDto>(
    api(t.path("/quotes"), { method: "POST", as: t.userId, json: { customerCompany: "Acme" } }),
    201,
  );

const addLine = (t: Tenant, quoteId: string, line: Record<string, unknown>) =>
  json<QuoteDetailDto>(
    api(t.path(`/quotes/${quoteId}/lines`), { method: "POST", as: t.userId, json: line }),
    201,
  );

const patchLine = (t: Tenant, quoteId: string, lineId: string, patch: Record<string, unknown>) =>
  json<QuoteDetailDto>(
    api(t.path(`/quotes/${quoteId}/lines/${lineId}`), {
      method: "PATCH",
      as: t.userId,
      json: patch,
    }),
  );

/** What the editor's "Add line" button posts. */
const blankLine = (quantities: number[]) => ({
  partNumber: "New part",
  inputs: { quantities, material: null },
});

async function wonQuote(t: Tenant, partNumber: string, revision: string | null, rates: Rates) {
  const q = await newQuote(t);
  const d = await addLine(t, q.id, {
    partNumber,
    revision,
    inputs: { quantities: [10], ...millOps(rates, 6) },
  });
  await json(api(t.path(`/quotes/${q.id}/send`), { method: "POST", as: t.userId }));
  await json(
    api(t.path(`/quotes/${q.id}/outcome`), {
      method: "POST",
      as: t.userId,
      json: { outcome: "won", poNumber: "PO-1" },
    }),
  );
  const line = d.lines.at(-1);
  if (!line) throw new Error("no line");
  return { quote: d, line };
}

const setPrefill = (t: Tenant, on: boolean) =>
  json(
    api(t.path("/settings"), { method: "PATCH", as: t.userId, json: { prefillRepeatParts: on } }),
  );

describe("repeat parts, part 3: lines added by hand", () => {
  it("pre-fills a blank line when its part number is typed, at today's rates and its quantities", async () => {
    const t = await setupTenant();
    const rates = await seedRateCard(t);
    await setPrefill(t, true);
    const won = await wonQuote(t, "BRK-1001", "B", rates);
    await json(
      api(t.path(`/rate-card/machines/${rates.mill}`), {
        method: "PATCH",
        as: t.userId,
        json: { hourlyRateCents: 12_000 },
      }),
    );
    const q = await newQuote(t);
    const added = await addLine(t, q.id, blankLine([25, 100]));
    const line = added.lines[0];
    expect(line?.prefilledFrom).toBeNull();
    // The editor saves the typed part number with the inputs it still holds (blank).
    const saved = await patchLine(t, q.id, line?.id ?? "", {
      partNumber: " brk-1001",
      revision: "b",
      description: null,
      inputs: line?.inputs,
    });
    const l = saved.lines[0];
    expect(l?.prefilledFrom).toMatchObject({
      lineId: won.line.id,
      quoteId: won.quote.id,
      quoteNumber: won.quote.quoteNumber,
      customerCompany: "Acme",
    });
    expect(l?.partNumber).toBe("brk-1001");
    expect(l?.inputs.quantities).toEqual([25, 100]);
    expect(l?.inputs.operations[0]?.cycleMinutesPerPart).toBe(6);
    expect(l?.inputs.finishing).toEqual([{ opId: rates.anodize }]);
    expect(l?.breaks?.map((b) => b.quantity)).toEqual([25, 100]);
    expect(l?.snapshot?.machines.find((m) => m.id === rates.mill)?.hourlyRateCents).toBe(12_000);

    // Saving again (the estimator edits a cycle time) keeps the label and does not re-copy.
    const ops = l?.inputs.operations.map((o) => ({ ...o, cycleMinutesPerPart: 4 }));
    const edited = await patchLine(t, q.id, l?.id ?? "", {
      inputs: { ...l?.inputs, operations: ops },
    });
    expect(edited.lines[0]?.inputs.operations[0]?.cycleMinutesPerPart).toBe(4);
    expect(edited.lines[0]?.prefilledFrom?.lineId).toBe(won.line.id);
  });

  it("pre-fills a line posted with its part number, and not a different revision", async () => {
    const t = await setupTenant();
    const rates = await seedRateCard(t);
    await setPrefill(t, true);
    const won = await wonQuote(t, "BRK-1001", null, rates);
    const q = await newQuote(t);
    const d1 = await addLine(t, q.id, { ...blankLine([5]), partNumber: "BRK-1001" });
    expect(d1.lines[0]?.prefilledFrom?.lineId).toBe(won.line.id);
    expect(d1.lines[0]?.inputs.quantities).toEqual([5]);
    // Revision A was never won (the won one has no revision): nothing to take.
    const d2 = await addLine(t, q.id, { ...blankLine([5]), partNumber: "BRK-1001", revision: "A" });
    expect(d2.lines[1]?.prefilledFrom).toBeNull();
    expect(d2.lines[1]?.inputs.operations).toEqual([]);
  });

  it("never overwrites typed inputs, and re-saving the same part keeps a cleared line blank", async () => {
    const t = await setupTenant();
    const rates = await seedRateCard(t);
    await setPrefill(t, true);
    await wonQuote(t, "BRK-1001", null, rates);
    const q = await newQuote(t);
    const d = await addLine(t, q.id, blankLine([5]));
    const line = d.lines[0];
    const typed = { quantities: [5], material: null, finishing: [{ opId: rates.anodize }] };
    const s1 = await patchLine(t, q.id, line?.id ?? "", { partNumber: "BRK-1001", inputs: typed });
    expect(s1.lines[0]?.prefilledFrom).toBeNull();
    expect(s1.lines[0]?.inputs.operations).toEqual([]);
    expect(s1.lines[0]?.inputs.finishing).toEqual([{ opId: rates.anodize }]);
    // Cleared on purpose, same part number: still blank.
    const s2 = await patchLine(t, q.id, line?.id ?? "", {
      partNumber: "BRK-1001",
      inputs: { quantities: [5], material: null },
    });
    expect(s2.lines[0]?.prefilledFrom).toBeNull();
    expect(s2.lines[0]?.inputs.finishing).toEqual([]);
  });

  it("is off unless the shop opts in, and never takes another shop's quote", async () => {
    const a = await setupTenant();
    const b = await setupTenant();
    const ra = await seedRateCard(a);
    await seedRateCard(b);
    await wonQuote(a, "SHARED-1", null, ra);
    // A has not opted in.
    const qa = await newQuote(a);
    const da = await addLine(a, qa.id, { ...blankLine([5]), partNumber: "SHARED-1" });
    expect(da.lines[0]?.prefilledFrom).toBeNull();
    // B has opted in but has never quoted SHARED-1.
    await setPrefill(b, true);
    const qb = await newQuote(b);
    const added = await addLine(b, qb.id, blankLine([5]));
    const db = await patchLine(b, qb.id, added.lines[0]?.id ?? "", { partNumber: "SHARED-1" });
    expect(db.lines[0]?.prefilledFrom).toBeNull();
    expect(db.lines[0]?.inputs.operations).toEqual([]);
  });
});
