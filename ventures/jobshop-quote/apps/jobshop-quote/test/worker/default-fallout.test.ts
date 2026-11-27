// A shop-wide default fallout (shop settings, `defaultFalloutBps`): every new quote line from an RFQ
// starts with it, a line copied from a won quote keeps its own inputs, and it is priced on the
// starts like a fallout typed on the line. From the 2026-11-26 quality audit's "a shop-wide default
// fallout" (portfolio/quality/audits/2026-11-26-jobshop-quote.json in the public repository).
import type { QuoteDetailDto, RateCardDto, RfqDetailDto } from "@shared/api";
import { describe, expect, it } from "vitest";
import { api, json, seedRateCard, setupTenant } from "./helpers";

type Tenant = Awaited<ReturnType<typeof setupTenant>>;

const patchSettings = (t: Tenant, body: Record<string, unknown>) =>
  api(t.path("/settings"), { method: "PATCH", as: t.userId, json: body });

async function rfqWithPart(t: Tenant, partNumber: string, quantities: number[]) {
  const rfq = await json<RfqDetailDto>(
    api(t.path("/rfqs"), { method: "POST", as: t.userId, json: { bodyText: "Please quote." } }),
    201,
  );
  await json<RfqDetailDto>(
    api(t.path(`/rfqs/${rfq.id}/parts`), {
      method: "POST",
      as: t.userId,
      json: { partNumber, revision: null, quantities, confirmed: true },
    }),
    201,
  );
  return rfq;
}

const quoteFor = (t: Tenant, rfqId: string) =>
  json<QuoteDetailDto>(
    api(t.path("/quotes"), { method: "POST", as: t.userId, json: { rfqId } }),
    201,
  );

describe("default fallout", () => {
  it("is saved, read back on the rate card, cleared, and refused above 50%", async () => {
    const t = await setupTenant();
    const before = await json<RateCardDto>(api(t.path("/rate-card"), { as: t.userId }));
    expect(before.settings.defaultFalloutBps).toBeNull();
    await json(patchSettings(t, { defaultFalloutBps: 300 }));
    const card = await json<RateCardDto>(api(t.path("/rate-card"), { as: t.userId }));
    expect(card.settings.defaultFalloutBps).toBe(300);
    expect((await patchSettings(t, { defaultFalloutBps: 5001 })).status).toBe(400);
    expect((await patchSettings(t, { defaultFalloutBps: 0 })).status).toBe(400);
    expect((await patchSettings(t, { defaultFalloutBps: "3" })).status).toBe(400);
    await json(patchSettings(t, { defaultFalloutBps: null }));
    const cleared = await json<RateCardDto>(api(t.path("/rate-card"), { as: t.userId }));
    expect(cleared.settings.defaultFalloutBps).toBeNull();
  });

  it("starts each new line from an RFQ with it and prices the starts", async () => {
    const t = await setupTenant();
    await seedRateCard(t);
    const none = await quoteFor(t, (await rfqWithPart(t, "BRK-1", [100])).id);
    expect(none.lines[0]?.inputs.falloutBps).toBeUndefined();

    await json(patchSettings(t, { defaultFalloutBps: 300 }));
    const q = await quoteFor(t, (await rfqWithPart(t, "BRK-2", [100])).id);
    const line = q.lines[0];
    expect(line?.inputs.falloutBps).toBe(300);
    // The estimator still changes it per line, and 0 there means none.
    const edited = await json<QuoteDetailDto>(
      api(t.path(`/quotes/${q.id}/lines/${line?.id}`), {
        method: "PATCH",
        as: t.userId,
        json: { inputs: { ...line?.inputs, falloutBps: 0 } },
      }),
    );
    expect(edited.lines[0]?.inputs.falloutBps).toBe(0);
  });

  it("is priced: 100 good parts at 3% start 104 and run time is charged on 104", async () => {
    const t = await setupTenant();
    const rates = await seedRateCard(t);
    await json(patchSettings(t, { defaultFalloutBps: 300 }));
    const q = await quoteFor(t, (await rfqWithPart(t, "BRK-3", [100])).id);
    const line = q.lines[0];
    const priced = await json<QuoteDetailDto>(
      api(t.path(`/quotes/${q.id}/lines/${line?.id}`), {
        method: "PATCH",
        as: t.userId,
        json: {
          inputs: {
            ...line?.inputs,
            customerSuppliedMaterial: true,
            material: null,
            operations: [
              { machineId: rates.mill, label: "OP10", setupMinutes: 0, cycleMinutesPerPart: 6 },
            ],
            finishing: [],
          },
        },
      }),
    );
    const b = priced.lines[0]?.breaks?.[0];
    expect(b?.quantity).toBe(100);
    expect(b?.starts).toBe(104);
    // ceil(100 / 0.97) = 104 starts; the run is 0.1 h per part on each start.
    const noFallout = await json<QuoteDetailDto>(
      api(t.path(`/quotes/${q.id}/lines/${line?.id}`), {
        method: "PATCH",
        as: t.userId,
        json: { inputs: { ...priced.lines[0]?.inputs, falloutBps: 0 } },
      }),
    );
    const n = noFallout.lines[0]?.breaks?.[0];
    expect(b?.runCents).toBe(Math.round(((n?.runCents ?? 0) * 104) / 100));
  });
});
