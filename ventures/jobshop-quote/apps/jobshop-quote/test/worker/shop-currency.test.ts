// The shop's currency (shop_settings.currency): set on the rate card by an admin, one of
// SHOP_CURRENCIES, and printed on the costing basis and the quote PDF. Never across shops; null
// keeps a US shop's quotes exactly as they were.
import type { QuoteDetailDto, RateCardDto } from "@shared/api";
import { describe, expect, it } from "vitest";
import { addMember, api, json, seedRateCard, setupTenant } from "./helpers";

type Tenant = Awaited<ReturnType<typeof setupTenant>>;

const setCurrency = (t: Tenant, currency: string | null, as = t.userId) =>
  api(t.path("/settings"), { method: "PATCH", as, json: { currency } });

const card = (t: Tenant) => json<RateCardDto>(api(t.path("/rate-card"), { as: t.userId }));

async function pricedQuote(t: Tenant) {
  const r = await seedRateCard(t);
  const q = await json<QuoteDetailDto>(
    api(t.path("/quotes"), { method: "POST", as: t.userId, json: { customerCompany: "Acme" } }),
    201,
  );
  await json(
    api(t.path(`/quotes/${q.id}/lines`), {
      method: "POST",
      as: t.userId,
      json: {
        partNumber: "BRK-1",
        revision: "A",
        inputs: {
          quantities: [5],
          customerSuppliedMaterial: true,
          material: null,
          operations: [{ machineId: r.mill, label: "", setupMinutes: 30, cycleMinutesPerPart: 5 }],
        },
      },
    }),
    201,
  );
  return json<QuoteDetailDto>(api(t.path(`/quotes/${q.id}`), { as: t.userId }));
}

const pdfText = async (t: Tenant, id: string) =>
  new TextDecoder("latin1").decode(
    await (await api(t.path(`/quotes/${id}/pdf`), { as: t.userId })).arrayBuffer(),
  );

describe("shop currency", () => {
  it("is null (USD) until set; only listed codes are accepted", async () => {
    const t = await setupTenant();
    expect((await card(t)).settings.currency).toBeNull();

    expect((await setCurrency(t, "CAD")).status).toBe(200);
    expect((await card(t)).settings.currency).toBe("CAD");

    for (const bad of ["JPY", "cad", "XXX", "", "US$"]) {
      expect((await setCurrency(t, bad)).status, bad).toBe(400);
    }
    expect((await card(t)).settings.currency).toBe("CAD");

    expect((await setCurrency(t, null)).status).toBe(200);
    expect((await card(t)).settings.currency).toBeNull();
  });

  it("only an admin sets it, and only for their own shop", async () => {
    const a = await setupTenant();
    const b = await setupTenant();
    const estimator = await addMember(a.orgId, "estimator");
    expect((await setCurrency(a, "EUR", estimator)).status).toBe(403);
    const cross = await api(a.path("/settings"), {
      method: "PATCH",
      as: b.userId,
      json: { currency: "EUR" },
    });
    expect([403, 404]).toContain(cross.status);
    expect((await card(a)).settings.currency).toBeNull();
    expect((await card(b)).settings.currency).toBeNull();
  });

  it("prints the costing basis and the quote PDF in the shop's currency", async () => {
    const eur = await setupTenant();
    const usd = await setupTenant();
    expect((await setCurrency(eur, "EUR")).status).toBe(200);

    const qe = await pricedQuote(eur);
    const qu = await pricedQuote(usd);
    // 95.00 an hour on the seeded mill, same numbers in both shops; only the mark differs.
    expect(qe.lines[0]?.basis.join("\n")).toContain("at €95.00/h");
    expect(qu.lines[0]?.basis.join("\n")).toContain("at $95.00/h");
    expect(qe.lines[0]?.breaks?.[0]?.totalCents).toBe(qu.lines[0]?.breaks?.[0]?.totalCents);

    const pe = await pdfText(eur, qe.id);
    const pu = await pdfText(usd, qu.id);
    // WinAnsi puts the euro sign at 0x80, written as the octal escape \200 in the content stream.
    expect(pe).toContain("Prices in EUR");
    expect(pe).toMatch(/\(\\200[\d,]+\.\d\d\)/);
    expect(pe).not.toMatch(/\(\$[\d,]+\.\d\d\)/);
    // A shop that never chose a currency prints as before, with no currency line.
    expect(pu).not.toContain("Prices in");
    expect(pu).toMatch(/\(\$[\d,]+\.\d\d\)/);
  });
});
