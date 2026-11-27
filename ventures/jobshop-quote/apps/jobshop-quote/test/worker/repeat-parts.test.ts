// Repeat parts (services/quotes/history.ts): a line shows the shop's earlier quotes of its part
// number, and copying one brings its cost inputs over with this line's quantities, priced from
// today's rate card. Never across shops; viewers can look but not copy.
import type { PartHistoryDto, QuoteDetailDto } from "@shared/api";
import type { CostInputs } from "@shared/costing";
import { describe, expect, it } from "vitest";
import { addMember, api, json, seedRateCard, setupTenant } from "./helpers";

type Tenant = Awaited<ReturnType<typeof setupTenant>>;

async function quoteWithLine(
  t: Tenant,
  customerCompany: string,
  line: { partNumber: string; revision?: string | null; inputs: Partial<CostInputs> },
) {
  const q = await json<QuoteDetailDto>(
    api(t.path("/quotes"), { method: "POST", as: t.userId, json: { customerCompany } }),
    201,
  );
  const withLine = await json<QuoteDetailDto>(
    api(t.path(`/quotes/${q.id}/lines`), {
      method: "POST",
      as: t.userId,
      json: { partNumber: line.partNumber, revision: line.revision ?? null, inputs: line.inputs },
    }),
    201,
  );
  const added = withLine.lines.at(-1);
  if (!added) throw new Error("no line");
  return { quote: withLine, line: added };
}

const history = (t: Tenant, quoteId: string, lineId: string, as = t.userId) =>
  json<PartHistoryDto>(api(t.path(`/quotes/${quoteId}/lines/${lineId}/history`), { as }));

describe("repeat parts", () => {
  it("lists earlier quotes of the part number and copies one's inputs at today's rates", async () => {
    const t = await setupTenant();
    const rates = await seedRateCard(t);
    const pastInputs: Partial<CostInputs> = {
      quantities: [10, 50],
      customerSuppliedMaterial: true,
      material: null,
      operations: [
        { machineId: rates.mill, label: "OP10 mill", setupMinutes: 60, cycleMinutesPerPart: 12 },
      ],
      finishing: [{ opId: rates.anodize }],
    };
    const past = await quoteWithLine(t, "Example Robotics LLC", {
      partNumber: "BRK-1001",
      revision: "B",
      inputs: pastInputs,
    });
    expect(past.line.breaks).not.toBeNull();
    await json(api(t.path(`/quotes/${past.quote.id}/send`), { method: "POST", as: t.userId }));
    await json(
      api(t.path(`/quotes/${past.quote.id}/outcome`), {
        method: "POST",
        as: t.userId,
        json: { outcome: "won", poNumber: "PO-7731" },
      }),
    );
    // A different part on another quote never shows up.
    await quoteWithLine(t, "Example Robotics LLC", {
      partNumber: "SPC-220",
      inputs: { quantities: [5], material: null, customerSuppliedMaterial: true },
    });

    // The repeat order: same part, typed in lower case with a stray space, new revision, one qty.
    const now = await quoteWithLine(t, "Example Robotics LLC", {
      partNumber: " brk-1001",
      revision: "C",
      inputs: { quantities: [25], material: null },
    });
    expect(now.line.breaks).toBeNull(); // nothing entered yet

    const h = await history(t, now.quote.id, now.line.id);
    expect(h.items).toHaveLength(1);
    const [item] = h.items;
    expect(item).toMatchObject({
      lineId: past.line.id,
      quoteId: past.quote.id,
      status: "won",
      customerCompany: "Example Robotics LLC",
      revision: "B",
      sameRevision: false,
      material: "Customer-supplied",
      poNumber: "PO-7731",
      lostReason: null,
      operations: [
        { machine: "Haas VF-2", setupMinutes: 60, cycleMinutesPerPart: 12, retired: false },
      ],
    });
    expect(item?.breaks.map((b) => b.quantity)).toEqual([10, 50]);
    expect(item?.breaks[0]?.unitPriceCents).toBe(past.line.breaks?.[0]?.unitPriceCents);
    // The earlier quote's own line does not list itself.
    expect((await history(t, past.quote.id, past.line.id)).items).toHaveLength(1);

    // Rates went up since: the copy is priced at today's rate, with this line's quantity.
    await json(
      api(t.path(`/rate-card/machines/${rates.mill}`), {
        method: "PATCH",
        as: t.userId,
        json: { hourlyRateCents: 12_000 },
      }),
    );
    const copied = await json<QuoteDetailDto>(
      api(t.path(`/quotes/${now.quote.id}/lines/${now.line.id}/copy-from`), {
        method: "POST",
        as: t.userId,
        json: { sourceLineId: past.line.id },
      }),
    );
    const line = copied.lines.find((l) => l.id === now.line.id);
    expect(line?.partNumber).toBe("brk-1001");
    expect(line?.revision).toBe("C");
    expect(line?.inputs.quantities).toEqual([25]);
    expect(line?.inputs.operations).toEqual(pastInputs.operations);
    expect(line?.inputs.finishing).toEqual(pastInputs.finishing);
    expect(line?.breaks?.map((b) => b.quantity)).toEqual([25]);
    expect(line?.snapshot?.machines.find((m) => m.id === rates.mill)?.hourlyRateCents).toBe(12_000);
    // The sent quote is untouched.
    const sent = await json<QuoteDetailDto>(
      api(t.path(`/quotes/${past.quote.id}`), { as: t.userId }),
    );
    expect(sent.lines[0]?.snapshot?.machines[0]?.hourlyRateCents).toBe(9_500);
  });

  it("flags a retired machine in the history; a copy prices it at its current card rate, not the old snapshot", async () => {
    const t = await setupTenant();
    const rates = await seedRateCard(t);
    const past = await quoteWithLine(t, "A", {
      partNumber: "P-1",
      inputs: {
        quantities: [5],
        customerSuppliedMaterial: true,
        material: null,
        operations: [
          { machineId: rates.mill, label: "", setupMinutes: 30, cycleMinutesPerPart: 5 },
        ],
      },
    });
    await json(
      api(t.path(`/rate-card/machines/${rates.mill}`), {
        method: "PATCH",
        as: t.userId,
        json: { hourlyRateCents: 15_000 },
      }),
    );
    await api(t.path(`/rate-card/machines/${rates.mill}`), { method: "DELETE", as: t.userId });
    const now = await quoteWithLine(t, "A", {
      partNumber: "P-1",
      inputs: { quantities: [8], material: null },
    });
    const h = await history(t, now.quote.id, now.line.id);
    expect(h.items[0]?.operations[0]).toMatchObject({ machine: "Haas VF-2", retired: true });
    const copied = await json<QuoteDetailDto>(
      api(t.path(`/quotes/${now.quote.id}/lines/${now.line.id}/copy-from`), {
        method: "POST",
        as: t.userId,
        json: { sourceLineId: past.line.id },
      }),
    );
    const line = copied.lines.find((l) => l.id === now.line.id);
    expect(line?.breaks?.map((b) => b.quantity)).toEqual([8]);
    expect(line?.snapshot?.machines[0]?.hourlyRateCents).toBe(15_000);
    expect(past.line.snapshot?.machines[0]?.hourlyRateCents).toBe(9_500);
  });

  it("never reads or copies another shop's lines; viewers look but cannot copy; sent quotes are frozen", async () => {
    const a = await setupTenant();
    const b = await setupTenant();
    const ra = await seedRateCard(a);
    await seedRateCard(b);
    const theirs = await quoteWithLine(a, "A", {
      partNumber: "SHARED-1",
      inputs: {
        quantities: [5],
        customerSuppliedMaterial: true,
        material: null,
        operations: [{ machineId: ra.mill, label: "", setupMinutes: 30, cycleMinutesPerPart: 5 }],
      },
    });
    const mine = await quoteWithLine(b, "B", {
      partNumber: "SHARED-1",
      inputs: { quantities: [5], material: null },
    });
    expect((await history(b, mine.quote.id, mine.line.id)).items).toEqual([]);
    const cross = await api(b.path(`/quotes/${mine.quote.id}/lines/${mine.line.id}/copy-from`), {
      method: "POST",
      as: b.userId,
      json: { sourceLineId: theirs.line.id },
    });
    expect(cross.status).toBe(404);
    // B's member cannot read A's line history through A's path either.
    const peek = await api(a.path(`/quotes/${theirs.quote.id}/lines/${theirs.line.id}/history`), {
      as: b.userId,
    });
    expect(peek.status).toBe(404);

    // Viewer in A: history yes, copy no.
    const second = await quoteWithLine(a, "A", {
      partNumber: "SHARED-1",
      inputs: { quantities: [7], material: null },
    });
    const viewer = await addMember(a.orgId, "viewer");
    expect((await history(a, second.quote.id, second.line.id, viewer)).items).toHaveLength(1);
    const denied = await api(
      a.path(`/quotes/${second.quote.id}/lines/${second.line.id}/copy-from`),
      { method: "POST", as: viewer, json: { sourceLineId: theirs.line.id } },
    );
    expect(denied.status).toBe(403);

    // A sent quote's line cannot be overwritten by a copy.
    await json(api(a.path(`/quotes/${theirs.quote.id}/send`), { method: "POST", as: a.userId }));
    const frozen = await api(
      a.path(`/quotes/${theirs.quote.id}/lines/${theirs.line.id}/copy-from`),
      { method: "POST", as: a.userId, json: { sourceLineId: second.line.id } },
    );
    expect(frozen.status).toBe(409);
    // A line cannot copy itself, and an unknown id is a 404.
    for (const sourceLineId of [second.line.id, "qln_nope"]) {
      const r = await api(a.path(`/quotes/${second.quote.id}/lines/${second.line.id}/copy-from`), {
        method: "POST",
        as: a.userId,
        json: { sourceLineId },
      });
      expect(r.status).toBe(404);
    }
  });
});
