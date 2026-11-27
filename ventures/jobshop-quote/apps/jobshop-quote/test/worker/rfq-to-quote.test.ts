// End to end through the API: rate card -> RFQ intake (email + PDF) -> extraction -> review ->
// quote priced by the engine -> cover note -> send (PDF frozen in R2) -> won/lost log.
import { env } from "cloudflare:workers";
import type { QuoteDetailDto, QuoteStatsDto, RfqDetailDto } from "@shared/api";
import type { CostInputs } from "@shared/costing";
import { testFakes } from "@worker/context";
import { afterEach, describe, expect, it } from "vitest";
import { DRAWING_TEXT, RFQ_EMAIL } from "../fixtures/rfq";
import { addMember, api, json, seedRateCard, setupTenant } from "./helpers";

afterEach(() => {
  testFakes.llmHandlers.clear();
});

async function createRfqWithDrawing(t: Awaited<ReturnType<typeof setupTenant>>) {
  const form = new FormData();
  form.set("subject", "RFQ - brackets and spacers");
  form.set("bodyText", RFQ_EMAIL);
  form.append("files", new File([DRAWING_TEXT], "BRK-1001.pdf", { type: "application/pdf" }));
  return json<RfqDetailDto>(
    api(t.path("/rfqs"), { method: "POST", as: t.userId, body: form }),
    201,
  );
}

describe("RFQ intake and extraction", () => {
  it("stores the email and drawing, reads the drawing text, and extracts verified parts", async () => {
    const t = await setupTenant();
    const rates = await seedRateCard(t);
    const rfq = await createRfqWithDrawing(t);
    expect(rfq.files).toHaveLength(1);
    expect(rfq.files[0]?.hasText).toBe(true);
    const stored = await env.FILES.list({ prefix: `orgs/${t.orgId}/rfqs/${rfq.id}/` });
    expect(stored.objects).toHaveLength(1);

    const ex = await json<RfqDetailDto>(
      api(t.path(`/rfqs/${rfq.id}/extract`), { method: "POST", as: t.userId }),
    );
    expect(ex.status).toBe("extracted");
    expect(ex.customerCompany).toBe("Example Robotics LLC");
    expect(ex.customerEmail).toBe("dana.ortiz@example-robotics.test");
    expect(ex.extractionWarnings).toEqual([]);
    const [brk, spc] = ex.parts;
    expect(brk).toMatchObject({
      partNumber: "BRK-1001",
      revision: "B",
      quantities: [10, 50, 100],
      materialId: rates.al, // suggested from "6061-T6 aluminum plate"
      finishingOpIds: [rates.anodize],
      dueDate: "2026-12-18",
      origin: "llm",
      confirmed: false,
    });
    expect(brk?.sources.material?.quote).toBe("Material: 6061-T6 aluminum plate");
    expect(spc).toMatchObject({ partNumber: "SPC-220", materialId: rates.ss, quantities: [250] });

    // The download is served from the tenant's own R2 prefix.
    const dl = await api(t.path(`/rfqs/${rfq.id}/files/${rfq.files[0]?.id}/download`), {
      as: t.userId,
    });
    expect(dl.status).toBe(200);
    expect(await dl.text()).toBe(DRAWING_TEXT);
  });

  it("drops values the model invents and says so", async () => {
    const t = await setupTenant();
    testFakes.llmHandlers.set("rfq.extract", () => ({
      customer: {
        company: { value: "Example Robotics LLC", quote: "Company: Example Robotics LLC" },
        contactName: { value: null, quote: null },
        email: { value: null, quote: null },
      },
      parts: [
        {
          partNumber: { value: "BRK-1001", quote: "Part number: BRK-1001 Rev B" },
          revision: { value: "B", quote: "Part number: BRK-1001 Rev B" },
          description: { value: null, quote: null },
          material: { value: "Ti-6Al-4V", quote: "Material: Ti-6Al-4V" }, // not in the RFQ
          quantities: { values: [10, 5000], quote: "Qty: 10, 50, 100" }, // 5000 is invented
          tolerances: { value: "+/- .0005", quote: "Tolerances: +/- .005 unless noted" },
          finish: { value: null, quote: null },
          dueDate: { value: null, quote: null },
        },
      ],
      missingInfo: [],
    }));
    const rfq = await json<RfqDetailDto>(
      api(t.path("/rfqs"), { method: "POST", as: t.userId, json: { bodyText: RFQ_EMAIL } }),
      201,
    );
    const ex = await json<RfqDetailDto>(
      api(t.path(`/rfqs/${rfq.id}/extract`), { method: "POST", as: t.userId }),
    );
    const part = ex.parts[0];
    expect(part?.materialText).toBeNull();
    expect(part?.tolerances).toBeNull();
    expect(part?.quantities).toEqual([10]);
    expect(ex.extractionWarnings).toHaveLength(3);
  });

  it("re-extraction keeps confirmed and hand-entered parts", async () => {
    const t = await setupTenant();
    const rfq = await json<RfqDetailDto>(
      api(t.path("/rfqs"), { method: "POST", as: t.userId, json: { bodyText: RFQ_EMAIL } }),
      201,
    );
    const first = await json<RfqDetailDto>(
      api(t.path(`/rfqs/${rfq.id}/extract`), { method: "POST", as: t.userId }),
    );
    await json(
      api(t.path(`/rfqs/${rfq.id}/parts/${first.parts[0]?.id}`), {
        method: "PATCH",
        as: t.userId,
        json: { confirmed: true, notes: "checked" },
      }),
    );
    await json(
      api(t.path(`/rfqs/${rfq.id}/parts`), {
        method: "POST",
        as: t.userId,
        json: { partNumber: "EXTRA-1", quantities: [5] },
      }),
      201,
    );
    const again = await json<RfqDetailDto>(
      api(t.path(`/rfqs/${rfq.id}/extract`), { method: "POST", as: t.userId }),
    );
    expect(again.parts.map((p) => [p.partNumber, p.origin, p.confirmed])).toEqual([
      ["BRK-1001", "llm", true],
      ["EXTRA-1", "user", false],
      // the unconfirmed BRK-1001 duplicate is re-extracted alongside SPC-220
      ["BRK-1001", "llm", false],
      ["SPC-220", "llm", false],
    ]);
  });

  it("links CAD geometry from the sibling cad-features port and sizes the blank from it", async () => {
    const t = await setupTenant();
    const rates = await seedRateCard(t);
    testFakes.geometry.set("BRK-1001.step", {
      volumeIn3: 4.2,
      boundingBoxIn: { xIn: 3.9, yIn: 1, zIn: 0.5 },
      surfaceAreaIn2: null,
      holes: [{ diameterIn: 0.201, depthIn: 0.5, count: 4, threaded: true }],
      source: "fake",
    });
    const form = new FormData();
    form.set("bodyText", RFQ_EMAIL);
    form.append("files", new File(["ISO-10303-21;"], "BRK-1001.step"));
    const rfq = await json<RfqDetailDto>(
      api(t.path("/rfqs"), { method: "POST", as: t.userId, body: form }),
      201,
    );
    expect(rfq.files[0]?.geometry?.volumeIn3).toBe(4.2);
    const ex = await json<RfqDetailDto>(
      api(t.path(`/rfqs/${rfq.id}/extract`), { method: "POST", as: t.userId }),
    );
    const brk = ex.parts.find((p) => p.partNumber === "BRK-1001");
    expect(brk?.geometryFileId).toBe(rfq.files[0]?.id);
    await json(
      api(t.path(`/rfqs/${rfq.id}/parts/${brk?.id}`), {
        method: "PATCH",
        as: t.userId,
        json: { confirmed: true },
      }),
    );
    const q = await json<QuoteDetailDto>(
      api(t.path("/quotes"), { method: "POST", as: t.userId, json: { rfqId: rfq.id } }),
      201,
    );
    expect(q.lines[0]?.inputs.material).toEqual({
      materialId: rates.al,
      blank: { shape: "rect", thicknessIn: 0.75, widthIn: 1.25, lengthIn: 4.25 },
      partsPerStock: null,
    });
  });

  it("rejects unsupported uploads and empty RFQs", async () => {
    const t = await setupTenant();
    const form = new FormData();
    form.append("files", new File(["MZ"], "setup.exe", { type: "application/x-msdownload" }));
    const bad = await api(t.path("/rfqs"), { method: "POST", as: t.userId, body: form });
    expect(bad.status).toBe(400);
    const empty = await api(t.path("/rfqs"), {
      method: "POST",
      as: t.userId,
      json: { bodyText: " " },
    });
    expect(empty.status).toBe(400);
  });
});

describe("quotes", () => {
  async function quotedRfq() {
    const t = await setupTenant();
    const rates = await seedRateCard(t);
    const rfq = await createRfqWithDrawing(t);
    const ex = await json<RfqDetailDto>(
      api(t.path(`/rfqs/${rfq.id}/extract`), { method: "POST", as: t.userId }),
    );
    const brk = ex.parts.find((p) => p.partNumber === "BRK-1001");
    const before = await api(t.path("/quotes"), {
      method: "POST",
      as: t.userId,
      json: { rfqId: rfq.id },
    });
    expect(before.status).toBe(409); // nothing confirmed yet
    await json(
      api(t.path(`/rfqs/${rfq.id}/parts/${brk?.id}`), {
        method: "PATCH",
        as: t.userId,
        json: { confirmed: true },
      }),
    );
    const quote = await json<QuoteDetailDto>(
      api(t.path("/quotes"), { method: "POST", as: t.userId, json: { rfqId: rfq.id } }),
      201,
    );
    return { t, rates, rfq, quote };
  }

  it("creates a draft from confirmed parts that cannot price until the estimator fills inputs", async () => {
    const { quote, rates } = await quotedRfq();
    expect(quote.quoteNumber).toBe(1001);
    expect(quote.customerCompany).toBe("Example Robotics LLC");
    expect(quote.lines).toHaveLength(1);
    const line = quote.lines[0];
    expect(line?.inputs.quantities).toEqual([10, 50, 100]);
    expect(line?.inputs.finishing).toEqual([{ opId: rates.anodize }]);
    expect(line?.breaks).toBeNull();
    expect(line?.issues.map((i) => i.code)).toEqual(["no_operations", "material_needs_blank"]);
    expect(quote.headlineTotalCents).toBeNull();
  });

  it("prices from the rate card, sends a frozen PDF, and logs the outcome", async () => {
    const { t, rates, rfq, quote } = await quotedRfq();
    const line = quote.lines[0];
    const inputs: CostInputs = {
      quantities: [10, 50, 100],
      customerSuppliedMaterial: false,
      material: {
        materialId: rates.al,
        blank: { shape: "rect", lengthIn: 4, widthIn: 2, thicknessIn: 1 },
        partsPerStock: null,
      },
      operations: [
        { machineId: rates.mill, label: "Mill", setupMinutes: 60, cycleMinutesPerPart: 12 },
      ],
      finishing: [{ opId: rates.anodize }],
      extras: [],
    };

    // Preview matches what the line stores.
    const preview = await json<{ ok: boolean; result: { breaks: { totalCents: number }[] } }>(
      api(t.path("/costing/preview"), { method: "POST", as: t.userId, json: { inputs } }),
    );
    const priced = await json<QuoteDetailDto>(
      api(t.path(`/quotes/${quote.id}/lines/${line?.id}`), {
        method: "PATCH",
        as: t.userId,
        json: { inputs },
      }),
    );
    const breaks = priced.lines[0]?.breaks ?? [];
    expect(breaks.map((b) => b.totalCents)).toEqual(preview.result.breaks.map((b) => b.totalCents));
    expect(breaks[0]).toMatchObject({ quantity: 10, unitPriceCents: 5_807, totalCents: 58_070 });
    expect(priced.headlineTotalCents).toBe(58_070);
    expect(priced.lines[0]?.snapshot?.machines[0]?.hourlyRateCents).toBe(9_500);

    // An empty PATCH is a no-op, not an error.
    const noop = await api(t.path(`/rate-card/machines/${rates.mill}`), {
      method: "PATCH",
      as: t.userId,
      json: {},
    });
    expect(noop.status).toBe(200);

    // A rate change does not touch the saved line until the estimator recalculates.
    await json(
      api(t.path(`/rate-card/machines/${rates.mill}`), {
        method: "PATCH",
        as: t.userId,
        json: { hourlyRateCents: 12_000 },
      }),
    );
    const unchanged = await json<QuoteDetailDto>(
      api(t.path(`/quotes/${quote.id}`), { as: t.userId }),
    );
    expect(unchanged.headlineTotalCents).toBe(58_070);
    const recalculated = await json<QuoteDetailDto>(
      api(t.path(`/quotes/${quote.id}/recalculate`), { method: "POST", as: t.userId }),
    );
    expect(recalculated.headlineTotalCents).toBeGreaterThan(58_070);

    // Cover note: LLM explains the computed quote; every number is grounded.
    const noted = await json<QuoteDetailDto>(
      api(t.path(`/quotes/${quote.id}/cover-note`), { method: "POST", as: t.userId }),
    );
    expect(noted.coverNoteSource).toBe("llm");
    expect(noted.coverNote).toContain("Q-1001");

    // Draft PDF renders.
    const draftPdf = await api(t.path(`/quotes/${quote.id}/pdf`), { as: t.userId });
    expect(draftPdf.headers.get("Content-Type")).toBe("application/pdf");
    expect(new TextDecoder().decode((await draftPdf.arrayBuffer()).slice(0, 8))).toBe("%PDF-1.4");

    // Send: frozen.
    const sent = await json<QuoteDetailDto>(
      api(t.path(`/quotes/${quote.id}/send`), { method: "POST", as: t.userId }),
    );
    expect(sent.status).toBe("sent");
    expect(sent.sentPdfSha256).toMatch(/^[0-9a-f]{64}$/);
    const stored = await env.FILES.list({ prefix: `orgs/${t.orgId}/quotes/${quote.id}/` });
    expect(stored.objects.map((o) => o.key)).toEqual([
      `orgs/${t.orgId}/quotes/${quote.id}/Q-1001-${sent.sentPdfSha256?.slice(0, 16)}.pdf`,
    ]);
    const rfqAfter = await json<RfqDetailDto>(api(t.path(`/rfqs/${rfq.id}`), { as: t.userId }));
    expect(rfqAfter.status).toBe("quoted");
    const edit = await api(t.path(`/quotes/${quote.id}/lines/${line?.id}`), {
      method: "PATCH",
      as: t.userId,
      json: { inputs: { ...inputs, quantities: [1] } },
    });
    expect(edit.status).toBe(409);
    const sentPdf = new Uint8Array(
      await (await api(t.path(`/quotes/${quote.id}/pdf`), { as: t.userId })).arrayBuffer(),
    );
    const digest = await crypto.subtle.digest("SHA-256", sentPdf);
    const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
    expect(hex).toBe(sent.sentPdfSha256);

    // Won / lost log.
    const won = await json<QuoteDetailDto>(
      api(t.path(`/quotes/${quote.id}/outcome`), {
        method: "POST",
        as: t.userId,
        json: { outcome: "won", poNumber: "PO-7781" },
      }),
    );
    expect(won).toMatchObject({ status: "won", poNumber: "PO-7781" });
    expect(won.wonAmountCents).toBe(recalculated.headlineTotalCents);
    const stats = await json<QuoteStatsDto>(api(t.path("/quotes/stats"), { as: t.userId }));
    expect(stats.byStatus.won).toBe(1);
    expect(stats.winRate).toBe(1);
    const lost = await json<QuoteDetailDto>(
      api(t.path(`/quotes/${quote.id}/outcome`), {
        method: "POST",
        as: t.userId,
        json: { outcome: "lost", reason: "price" },
      }),
    );
    expect(lost).toMatchObject({ status: "lost", lostReason: "price", poNumber: null });
  });

  it("falls back to the template when the model's note invents a number", async () => {
    const { t, rates, quote } = await quotedRfq();
    await json(
      api(t.path(`/quotes/${quote.id}/lines/${quote.lines[0]?.id}`), {
        method: "PATCH",
        as: t.userId,
        json: {
          inputs: {
            quantities: [10],
            customerSuppliedMaterial: true,
            material: null,
            operations: [{ machineId: rates.mill, setupMinutes: 30, cycleMinutesPerPart: 5 }],
          },
        },
      }),
    );
    testFakes.llmHandlers.set("quote.cover_note", () => "Great news: 15% off if you order today!");
    const q = await json<QuoteDetailDto>(
      api(t.path(`/quotes/${quote.id}/cover-note`), { method: "POST", as: t.userId }),
    );
    expect(q.coverNoteSource).toBe("template");
    expect(q.coverNote).not.toContain("15%");
  });

  it("refuses to send unpriced lines and rejects rate ids from the request that aren't on the card", async () => {
    const { t, quote } = await quotedRfq();
    const send = await api(t.path(`/quotes/${quote.id}/send`), { method: "POST", as: t.userId });
    expect(send.status).toBe(409);
    const bogus = await json<QuoteDetailDto>(
      api(t.path(`/quotes/${quote.id}/lines/${quote.lines[0]?.id}`), {
        method: "PATCH",
        as: t.userId,
        json: {
          inputs: {
            quantities: [1],
            customerSuppliedMaterial: true,
            material: null,
            operations: [{ machineId: "mch_not_mine", setupMinutes: 1, cycleMinutesPerPart: 1 }],
          },
        },
      }),
    );
    expect(bogus.lines[0]?.issues.map((i) => i.code)).toEqual(["unknown_machine"]);
    const invalid = await api(t.path(`/quotes/${quote.id}/lines/${quote.lines[0]?.id}`), {
      method: "PATCH",
      as: t.userId,
      json: { inputs: { quantities: [-1] } },
    });
    expect(invalid.status).toBe(400);
  });

  it("numbers quotes per shop and lets estimators but not viewers write", async () => {
    const t = await setupTenant();
    const viewer = await addMember(t.orgId, "viewer");
    const estimator = await addMember(t.orgId, "estimator");
    const a = await json<QuoteDetailDto>(
      api(t.path("/quotes"), { method: "POST", as: estimator, json: { customerCompany: "A" } }),
      201,
    );
    const b = await json<QuoteDetailDto>(
      api(t.path("/quotes"), { method: "POST", as: t.userId, json: { customerCompany: "B" } }),
      201,
    );
    expect([a.quoteNumber, b.quoteNumber]).toEqual([1001, 1002]);
    const denied = await api(t.path("/quotes"), { method: "POST", as: viewer, json: {} });
    expect(denied.status).toBe(403);
    const list = await json<{ items: { quoteNumber: number }[] }>(
      api(t.path("/quotes"), { as: viewer }),
    );
    expect(list.items.map((q) => q.quoteNumber)).toEqual([1002, 1001]);
    // Estimators cannot change prices on the rate card.
    const rate = await api(t.path("/rate-card/machines"), {
      method: "POST",
      as: estimator,
      json: { name: "Lathe", kind: "lathe", hourlyRateCents: 1 },
    });
    expect(rate.status).toBe(403);
  });
});
