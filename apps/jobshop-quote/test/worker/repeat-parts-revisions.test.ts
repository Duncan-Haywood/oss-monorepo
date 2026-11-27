// Repeat parts, part 4 (services/quotes updateLine, history.ts): a "Pre-filled from" label goes when
// the line's part number or revision changes, or when the estimator copies another line's inputs;
// and the part history carries each earlier quote's RFQ files, so a part won only at another
// revision can be checked drawing against drawing. Never across shops.
import type { PartHistoryDto, QuoteDetailDto, RfqDetailDto } from "@shared/api";
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
});

const newQuote = (t: Tenant, body: Record<string, unknown> = { customerCompany: "Acme" }) =>
  json<QuoteDetailDto>(api(t.path("/quotes"), { method: "POST", as: t.userId, json: body }), 201);

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

const history = (t: Tenant, quoteId: string, lineId: string) =>
  json<PartHistoryDto>(api(t.path(`/quotes/${quoteId}/lines/${lineId}/history`), { as: t.userId }));

async function sendAndWin(t: Tenant, quoteId: string) {
  await json(api(t.path(`/quotes/${quoteId}/send`), { method: "POST", as: t.userId }));
  await json(
    api(t.path(`/quotes/${quoteId}/outcome`), {
      method: "POST",
      as: t.userId,
      json: { outcome: "won", poNumber: "PO-7" },
    }),
  );
}

async function wonQuote(t: Tenant, partNumber: string, revision: string | null, cycle: number) {
  const rates = await seedRateCard(t);
  const q = await newQuote(t);
  const d = await addLine(t, q.id, {
    partNumber,
    revision,
    inputs: { quantities: [10], ...millOps(rates, cycle) },
  });
  await sendAndWin(t, q.id);
  const line = d.lines.at(-1);
  if (!line) throw new Error("no line");
  return { quote: d, line, rates };
}

const setPrefill = (t: Tenant) =>
  json(
    api(t.path("/settings"), { method: "PATCH", as: t.userId, json: { prefillRepeatParts: true } }),
  );

/** A pre-filled line on a fresh quote, from the won BRK-1001 rev B line. */
async function prefilledLine(t: Tenant) {
  await setPrefill(t);
  const won = await wonQuote(t, "BRK-1001", "B", 6);
  const q = await newQuote(t);
  const d = await addLine(t, q.id, {
    partNumber: "BRK-1001",
    revision: "B",
    inputs: { quantities: [25], material: null },
  });
  const line = d.lines[0];
  if (!line?.prefilledFrom) throw new Error("not pre-filled");
  expect(line.prefilledFrom.lineId).toBe(won.line.id);
  return { won, q, line };
}

describe("repeat parts, part 4: a stale label", () => {
  it("drops the label when the part number changes, and keeps the inputs", async () => {
    const t = await setupTenant();
    const { q, line } = await prefilledLine(t);
    // Same part, other case and spacing: still the same part, label kept.
    const same = await patchLine(t, q.id, line.id, { partNumber: " brk-1001 ", revision: "b" });
    expect(same.lines[0]?.prefilledFrom?.lineId).toBe(line.prefilledFrom?.lineId);
    const moved = await patchLine(t, q.id, line.id, { partNumber: "BRK-2002" });
    expect(moved.lines[0]?.prefilledFrom).toBeNull();
    expect(moved.lines[0]?.inputs.operations[0]?.cycleMinutesPerPart).toBe(6);
    expect(moved.lines[0]?.inputs.quantities).toEqual([25]);
  });

  it("drops the label when the revision changes or is cleared", async () => {
    const t = await setupTenant();
    const a = await prefilledLine(t);
    const revC = await patchLine(t, a.q.id, a.line.id, { revision: "C" });
    expect(revC.lines[0]?.prefilledFrom).toBeNull();

    const b = await addLine(t, a.q.id, {
      partNumber: "BRK-1001",
      revision: "B",
      inputs: { quantities: [5], material: null },
    });
    const second = b.lines[1];
    expect(second?.prefilledFrom).not.toBeNull();
    const cleared = await patchLine(t, a.q.id, second?.id ?? "", { revision: null });
    expect(cleared.lines[1]?.prefilledFrom).toBeNull();
  });

  it("drops the label when another line's inputs are copied, not when its own source is", async () => {
    const t = await setupTenant();
    const { won, q, line } = await prefilledLine(t);
    // Copying the very line the label names again keeps it.
    const again = await json<QuoteDetailDto>(
      api(t.path(`/quotes/${q.id}/lines/${line.id}/copy-from`), {
        method: "POST",
        as: t.userId,
        json: { sourceLineId: won.line.id },
      }),
    );
    expect(again.lines[0]?.prefilledFrom?.lineId).toBe(won.line.id);
    // A lost quote of the same part, copied over: the label no longer says where the inputs came from.
    const other = await newQuote(t);
    const o = await addLine(t, other.id, {
      partNumber: "BRK-1001",
      revision: "B",
      inputs: { quantities: [10], ...millOps(won.rates, 9) },
    });
    const copied = await json<QuoteDetailDto>(
      api(t.path(`/quotes/${q.id}/lines/${line.id}/copy-from`), {
        method: "POST",
        as: t.userId,
        json: { sourceLineId: o.lines.at(-1)?.id },
      }),
    );
    expect(copied.lines[0]?.prefilledFrom).toBeNull();
    expect(copied.lines[0]?.inputs.operations[0]?.cycleMinutesPerPart).toBe(9);
  });
});

describe("repeat parts, part 4: won at another revision", () => {
  it("lists the earlier quote's RFQ and its files, the shop's own only", async () => {
    const t = await setupTenant();
    const rates = await seedRateCard(t);
    const rfq = await json<RfqDetailDto>(
      api(t.path("/rfqs"), { method: "POST", as: t.userId, json: { bodyText: "Please quote." } }),
      201,
    );
    const form = new FormData();
    form.append(
      "files",
      new File(["BRK-1001 rev A notes"], "brk-1001-a.txt", { type: "text/plain" }),
    );
    const withFile = await json<RfqDetailDto>(
      api(t.path(`/rfqs/${rfq.id}/files`), { method: "POST", as: t.userId, body: form }),
    );
    const file = withFile.files[0];
    expect(file).toBeDefined();
    await json(
      api(t.path(`/rfqs/${rfq.id}/parts`), {
        method: "POST",
        as: t.userId,
        json: { partNumber: "BRK-1001", revision: "A", quantities: [10], confirmed: true },
      }),
      201,
    );
    const old = await newQuote(t, { rfqId: rfq.id });
    const oldLine = old.lines[0];
    expect(oldLine?.partNumber).toBe("BRK-1001");
    await patchLine(t, old.id, oldLine?.id ?? "", {
      inputs: { quantities: [10], ...millOps(rates, 6) },
    });
    await sendAndWin(t, old.id);

    // A quote typed by hand has no RFQ: its history entry says so.
    const handQuote = await newQuote(t);
    await addLine(t, handQuote.id, {
      partNumber: "BRK-1001",
      revision: "A",
      inputs: { quantities: [3], ...millOps(rates, 6) },
    });

    const q = await newQuote(t);
    const n = await addLine(t, q.id, {
      partNumber: "BRK-1001",
      revision: "B",
      inputs: { quantities: [25], material: null },
    });
    const h = await history(t, q.id, n.lines[0]?.id ?? "");
    const wonItem = h.items.find((i) => i.lineId === oldLine?.id);
    expect(wonItem).toMatchObject({
      status: "won",
      sameRevision: false,
      rfqId: rfq.id,
      rfqFiles: [{ id: file?.id, fileName: "brk-1001-a.txt" }],
    });
    expect(h.items.find((i) => i.quoteId === handQuote.id)).toMatchObject({
      rfqId: null,
      rfqFiles: [],
    });

    // Another shop with the same part number sees none of it.
    const other = await setupTenant();
    await seedRateCard(other);
    const oq = await newQuote(other);
    const ol = await addLine(other, oq.id, {
      partNumber: "BRK-1001",
      revision: "B",
      inputs: { quantities: [1], material: null },
    });
    expect((await history(other, oq.id, ol.lines[0]?.id ?? "")).items).toEqual([]);
  });
});
