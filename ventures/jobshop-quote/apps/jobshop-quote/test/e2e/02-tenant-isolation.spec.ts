// One shop never sees another's RFQs, quotes or rate card: not through the API, not through the app's
// URLs. Two users in separate browser contexts, each with their own shop.
import { expect, test } from "@playwright/test";
import { api, RFQ_EMAIL, signUpWithShop } from "./helpers";

test("a second shop cannot read the first shop's data", async ({ browser, baseURL }) => {
  const base = baseURL as string;
  const a = await browser.newContext();
  const b = await browser.newContext();
  try {
    const pageA = await a.newPage();
    const shopA = await signUpWithShop(pageA, { tag: "tenant-a", shop: "Shop A" });
    const orgA = (p: string) => `/api/orgs/${shopA.orgId}${p}`;
    await api(pageA.request, base, "POST", orgA("/rate-card/machines"), {
      name: "Shop A mill",
      kind: "mill_3axis",
      hourlyRateCents: 12_300,
    });
    const rfq = await api<{ id: string }>(pageA.request, base, "POST", orgA("/rfqs"), {
      subject: "Shop A private RFQ",
      bodyText: RFQ_EMAIL,
    });
    await api(pageA.request, base, "POST", orgA(`/rfqs/${rfq.id}/extract`), {});
    const detail = await api<{ parts: { id: string }[] }>(
      pageA.request,
      base,
      "GET",
      orgA(`/rfqs/${rfq.id}`),
    );
    for (const part of detail.parts) {
      await api(pageA.request, base, "PATCH", orgA(`/rfqs/${rfq.id}/parts/${part.id}`), {
        confirmed: true,
      });
    }
    const quote = await api<{ id: string }>(pageA.request, base, "POST", orgA("/quotes"), {
      rfqId: rfq.id,
    });

    const pageB = await b.newPage();
    const shopB = await signUpWithShop(pageB, { tag: "tenant-b", shop: "Shop B" });
    expect(shopB.orgId).not.toBe(shopA.orgId);

    // The API refuses every read of shop A's records with B's session.
    for (const path of [
      "",
      "/rfqs",
      `/rfqs/${rfq.id}`,
      "/quotes",
      `/quotes/${quote.id}`,
      `/quotes/${quote.id}/pdf`,
      "/rate-card",
    ]) {
      const res = await pageB.request.get(orgA(path));
      expect([403, 404], `GET ${orgA(path)} answered ${res.status()}`).toContain(res.status());
      expect(await res.text()).not.toContain("Shop A");
    }
    // ...and writes.
    const write = await pageB.request.post(orgA("/rfqs"), {
      data: { subject: "planted", bodyText: "x" },
      headers: { Origin: base },
    });
    expect([403, 404]).toContain(write.status());

    // B's own shop lists none of A's records.
    const me = await api<{ memberships: { orgId: string }[] }>(
      pageB.request,
      base,
      "GET",
      "/api/me",
    );
    expect(me.memberships.map((m) => m.orgId)).toEqual([shopB.orgId]);
    const rfqsB = await pageB.request.get(`/api/orgs/${shopB.orgId}/rfqs`);
    expect(await rfqsB.text()).not.toContain("Shop A private RFQ");

    // Opening A's quote URL in the app shows none of it.
    await pageB.goto(`${shopA.orgPath}/quotes/${quote.id}`);
    await pageB.waitForLoadState("networkidle");
    await expect(pageB.getByText("Shop A private RFQ")).toHaveCount(0);
    await expect(pageB.getByText("BRK-1001")).toHaveCount(0);
    await expect(pageB.getByText("Shop A mill")).toHaveCount(0);

    // Signed out, the API answers 401.
    const anon = await browser.newContext();
    try {
      const res = await anon.request.get(`${base}${orgA("/rfqs")}`);
      expect(res.status()).toBe(401);
    } finally {
      await anon.close();
    }
  } finally {
    await a.close();
    await b.close();
  }
});
