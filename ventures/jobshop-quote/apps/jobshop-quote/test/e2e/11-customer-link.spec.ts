// E2E: a customer link. The shop copies a link from a sent quote; the customer opens it in a
// browser with no session, picks a quoted quantity, types a PO and accepts; the shop's quote page
// then shows the answer and the quote as won.
import { expect, test } from "@playwright/test";
import { addBasicRateCard, api, card, field, signUpWithShop } from "./helpers";

test("a customer accepts a sent quote from its link, and the shop sees it won", async ({
  page,
  browser,
  baseURL,
}) => {
  const base = baseURL ?? "";
  const { orgId, orgPath } = await signUpWithShop(page, { tag: "link", shop: "E2E Link Shop" });
  await addBasicRateCard(page);

  // A priced, sent quote through the API (the editor itself is covered by 01-rfq-to-quote).
  const o = `/api/orgs/${orgId}`;
  const rc = await api<{ machines: { id: string }[] }>(page.request, base, "GET", `${o}/rate-card`);
  const machineId = rc.machines[0]?.id;
  const q = await api<{ id: string }>(page.request, base, "POST", `${o}/quotes`, {
    customerCompany: "Example Robotics LLC",
  });
  await api(page.request, base, "POST", `${o}/quotes/${q.id}/lines`, {
    partNumber: "BRK-1001",
    inputs: {
      quantities: [10, 50],
      customerSuppliedMaterial: true,
      material: null,
      operations: [{ machineId, label: "OP10 mill", setupMinutes: 30, cycleMinutesPerPart: 6 }],
    },
  });
  await api(page.request, base, "PATCH", `${o}/quotes/${q.id}`, { customerContact: "Sam Buyer" });
  await api(page.request, base, "POST", `${o}/quotes/${q.id}/send`);

  await page.goto(`${orgPath}/quotes/${q.id}`);
  const links = card(page, "Customer's answer online");
  await expect(links.getByText("No customer link yet.")).toBeVisible();
  await links.getByRole("button", { name: "Copy a customer link" }).click();
  const url = await field(links, "The link (shown once: copy it now)").inputValue();
  expect(url).toMatch(/\/q\/[A-Za-z0-9_-]{43}$/);

  // The customer: a fresh browser context, no cookies.
  const customer = await browser.newContext();
  const c = await customer.newPage();
  await c.goto(new URL(url).pathname);
  await expect(c.getByText("Quote Q-1001")).toBeVisible();
  await expect(c.getByText("E2E Link Shop", { exact: true })).toBeVisible();
  // No sideways scroll on a 390 px phone.
  await c.setViewportSize({ width: 390, height: 844 });
  expect(await c.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  if (process.env.E2E_SHOT) await c.screenshot({ path: process.env.E2E_SHOT, fullPage: true });
  const accept = card(c, "Accept this quote");
  await accept.getByRole("radio", { name: /^50 at / }).check();
  await expect(field(accept, "Your name")).toHaveValue("Sam Buyer");
  await field(accept, "PO number (optional)").fill("PO-4471");
  await accept.getByRole("button", { name: "Accept the quote" }).click();
  await expect(c.getByText("You accepted this quote.")).toBeVisible();
  await expect(c.getByText(/PO PO-4471/)).toBeVisible();
  await expect(c.getByText(/BRK-1001: 50 at/)).toBeVisible();
  // The PDF as sent opens from the page.
  const pdf = await c.request.get(
    `${new URL(url).pathname.replace("/q/", "/api/quote-links/")}/pdf`,
  );
  expect(pdf.headers()["content-type"]).toBe("application/pdf");
  await customer.close();

  // The shop: the answer and the quote marked won.
  await page.reload();
  await expect(page.getByText("won", { exact: true }).first()).toBeVisible();
  const answered = card(page, "Customer's answer online");
  await expect(answered.getByText("accepted", { exact: true })).toBeVisible();
  await expect(answered.getByText(/by Sam Buyer .*PO PO-4471/)).toBeVisible();
});
