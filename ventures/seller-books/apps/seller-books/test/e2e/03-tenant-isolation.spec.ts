// Two resellers in two browsers: one cannot open the other's shop, books or reports, by URL or by API.
// The worker tests check each route; this checks what a signed-in person actually reaches.
import { expect, test } from "@playwright/test";
import { importReport, signUpWithShop } from "./helpers";

test("a signed-in reseller cannot reach another reseller's shop", async ({ browser, baseURL }) => {
  const a = await browser.newContext();
  const b = await browser.newContext();
  try {
    const pageA = await a.newPage();
    const shopA = await signUpWithShop(pageA, { tag: "iso-a", shop: "Shop A" });
    await importReport(
      pageA,
      "eBay: Transaction report (Payments > Reports)",
      "ebay-transaction-report.csv",
    );
    await expect(pageA.getByText(/other charges imported/)).toContainText("3 sales");

    const pageB = await b.newPage();
    await signUpWithShop(pageB, { tag: "iso-b", shop: "Shop B" });

    // B's shop list does not name A's shop.
    await pageB.goto("/orgs");
    await expect(pageB.getByRole("link", { name: "Shop B" })).toBeVisible();
    await expect(pageB.getByRole("link", { name: "Shop A" })).toHaveCount(0);

    // Every read of A's books answers 404 (not 403, so ids cannot be probed), and a write is refused.
    for (const path of [
      "/sales",
      "/imports",
      "/inventory/items",
      "/reports/pnl?from=2026-01-01&to=2026-12-31",
      "/reports/schedule-c?year=2026",
      "/reports/schedule-c.csv?year=2026",
      "/billing",
    ]) {
      const res = await pageB.request.get(`/api/orgs/${shopA.orgId}${path}`);
      expect(res.status(), path).toBe(404);
    }
    const write = await pageB.request.post(`/api/orgs/${shopA.orgId}/expenses`, {
      headers: { Origin: baseURL ?? "" },
      data: { date: "2026-05-05", category: "supplies", amountCents: 100 },
    });
    expect(write.status()).toBe(404);

    // Opening A's pages by URL shows none of A's numbers.
    await pageB.goto(`${shopA.orgPath}/sales`);
    await expect(pageB.getByText("Vintage Levi's 501 jeans 32x30")).toHaveCount(0);

    // A still sees its own sales.
    await pageA.goto(`${shopA.orgPath}/sales`);
    await expect(pageA.getByText("Vintage Levi's 501 jeans 32x30").first()).toBeVisible();
  } finally {
    await a.close();
    await b.close();
  }
});
