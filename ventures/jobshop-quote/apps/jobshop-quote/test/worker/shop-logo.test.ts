// The shop's logo on its quote PDF (services/ratecard/logo.ts): an admin uploads a PNG or JPEG, any
// member previews it, every draft PDF prints it, a sent quote keeps the PDF it was sent with, and
// nothing crosses shops.
import { env } from "cloudflare:workers";
import type { QuoteDetailDto, RateCardDto, ShopSettingsDto } from "@shared/api";
import { describe, expect, it } from "vitest";
import { makeJpegHeader, makePng } from "../fixtures/images";
import { addMember, api, json, seedRateCard, setupTenant } from "./helpers";

type Tenant = Awaited<ReturnType<typeof setupTenant>>;

const putLogo = (t: Tenant, bytes: Uint8Array<ArrayBuffer>, as = t.userId, type = "image/png") =>
  api(t.path("/settings/logo"), {
    method: "PUT",
    as,
    body: bytes,
    headers: { "Content-Type": type, "Content-Length": String(bytes.length) },
  });

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
  return q;
}

const pdfText = async (t: Tenant, id: string) =>
  new TextDecoder("latin1").decode(
    await (await api(t.path(`/quotes/${id}/pdf`), { as: t.userId })).arrayBuffer(),
  );

describe("shop logo", () => {
  it("uploads, previews, prints on the quote PDF, and is removed", async () => {
    const t = await setupTenant();
    expect((await card(t)).settings.hasLogo).toBe(false);
    const q = await pricedQuote(t);
    expect(await pdfText(t, q.id)).not.toContain("/Subtype /Image");

    const png = await makePng(8, 2, [20, 60, 120]);
    const set = await json<ShopSettingsDto>(putLogo(t, png));
    expect(set.hasLogo).toBe(true);
    expect(set).not.toHaveProperty("logoKey");

    const preview = await api(t.path("/settings/logo"), { as: t.userId });
    expect(preview.status).toBe(200);
    expect(preview.headers.get("Content-Type")).toBe("image/png");
    expect(preview.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(new Uint8Array(await preview.arrayBuffer())).toEqual(png);

    const pdf = await pdfText(t, q.id);
    expect(pdf).toContain("/Subtype /Image /Width 8 /Height 2");
    expect(pdf).toContain("/Im0 Do");

    // A JPEG replaces it; the PNG's file is deleted from the shop's prefix.
    expect((await putLogo(t, makeJpegHeader(400, 100), t.userId, "image/jpeg")).status).toBe(200);
    const stored = await env.FILES.list({ prefix: `orgs/${t.orgId}/logo/` });
    expect(stored.objects.map((o) => o.key)).toEqual([expect.stringMatching(/\.jpg$/)]);
    expect(await pdfText(t, q.id)).toContain("/Width 400 /Height 100");

    const removed = await json<ShopSettingsDto>(
      api(t.path("/settings/logo"), { method: "DELETE", as: t.userId }),
    );
    expect(removed.hasLogo).toBe(false);
    expect((await env.FILES.list({ prefix: `orgs/${t.orgId}/logo/` })).objects).toHaveLength(0);
    expect((await api(t.path("/settings/logo"), { as: t.userId })).status).toBe(404);
    expect(await pdfText(t, q.id)).not.toContain("/Subtype /Image");
  });

  it("refuses files that are not a PNG or JPEG, or too big, and keeps the old logo", async () => {
    const t = await setupTenant();
    expect((await putLogo(t, await makePng(2, 2, [0, 0, 0]))).status).toBe(200);
    const svg = new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'><script/></svg>");
    // Content-Type says PNG; the bytes decide.
    const bad = await putLogo(t, svg, t.userId, "image/png");
    expect(bad.status).toBe(400);
    expect(await bad.text()).toContain("is not a PNG or JPEG image");
    const huge = await makePng(1, 1, [0, 0, 0], { declaredWidth: 4000, declaredHeight: 4000 });
    expect((await putLogo(t, huge)).status).toBe(400);
    const tooLong = await api(t.path("/settings/logo"), {
      method: "PUT",
      as: t.userId,
      body: new Uint8Array(1024 * 1024 + 10),
      headers: { "Content-Length": String(1024 * 1024 + 10) },
    });
    expect(tooLong.status).toBe(413);
    expect((await card(t)).settings.hasLogo).toBe(true);
    expect((await env.FILES.list({ prefix: `orgs/${t.orgId}/logo/` })).objects).toHaveLength(1);
  });

  it("only an admin changes it; members preview it; other shops see nothing", async () => {
    const a = await setupTenant();
    const b = await setupTenant();
    const estimator = await addMember(a.orgId, "estimator");
    const png = await makePng(2, 2, [0, 0, 0]);
    expect((await putLogo(a, png, estimator)).status).toBe(403);
    expect((await api(a.path("/settings/logo"), { method: "DELETE", as: estimator })).status).toBe(
      403,
    );
    expect((await putLogo(a, png)).status).toBe(200);
    expect((await api(a.path("/settings/logo"), { as: estimator })).status).toBe(200);

    expect([403, 404]).toContain((await api(a.path("/settings/logo"), { as: b.userId })).status);
    expect([403, 404]).toContain((await putLogo(a, png, b.userId)).status);
    expect((await card(b)).settings.hasLogo).toBe(false);
    expect((await api(b.path("/settings/logo"), { as: b.userId })).status).toBe(404);
    // A settings PATCH cannot point the logo at another shop's file.
    await api(b.path("/settings"), {
      method: "PATCH",
      as: b.userId,
      json: { logoKey: `orgs/${a.orgId}/logo/x.png` },
    });
    expect((await card(b)).settings.hasLogo).toBe(false);
  });

  it("a sent quote keeps the PDF it was sent with when the logo changes", async () => {
    const t = await setupTenant();
    expect((await putLogo(t, await makePng(6, 3, [0, 0, 0]))).status).toBe(200);
    const q = await pricedQuote(t);
    await json(api(t.path(`/quotes/${q.id}/send`), { method: "POST", as: t.userId }));
    expect(await pdfText(t, q.id)).toContain("/Width 6 /Height 3");
    expect((await api(t.path("/settings/logo"), { method: "DELETE", as: t.userId })).status).toBe(
      200,
    );
    expect(await pdfText(t, q.id)).toContain("/Width 6 /Height 3");
  });
});
