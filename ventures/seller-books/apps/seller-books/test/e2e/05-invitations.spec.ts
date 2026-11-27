// Inviting a helper or bookkeeper, in two browsers: the Free plan refuses an invitation with the
// reason; once the Business plan is confirmed the owner creates a viewer link; someone signed in with
// another address is refused; the invited address signs up from the link, joins, reads the books and
// cannot write them; after the owner removes them, the shop answers 404.
import { expect, test } from "@playwright/test";
import {
  confirmCheckout,
  importReport,
  labelled,
  nav,
  signUpWithShop,
  uniqueEmail,
} from "./helpers";

test("an invited viewer joins by link, reads the books, cannot write, and loses access when removed", async ({
  browser,
  baseURL,
}) => {
  const owner = await browser.newContext();
  const stranger = await browser.newContext();
  const guest = await browser.newContext();
  try {
    const page = await owner.newPage();
    const shop = await signUpWithShop(page, { tag: "inv-owner", shop: "Helper Wanted Resale" });
    await importReport(
      page,
      "eBay: Transaction report (Payments > Reports)",
      "ebay-transaction-report.csv",
    );
    await expect(page.getByText(/other charges imported/)).toContainText("3 sales");

    // Free is for one person: the invitation is refused with the way out, and no link is shown.
    const invitee = uniqueEmail("inv-viewer");
    await nav(page, "Members");
    await page.getByPlaceholder("Email to invite").fill(invitee);
    await page.locator("form select").selectOption("viewer");
    await page.getByRole("button", { name: "Send invitation" }).click();
    await expect(
      page.getByText(/The Free plan is for one person\. The Business plan adds/),
    ).toBeVisible();
    await expect(page.getByText(/Send this link to/)).toHaveCount(0);

    // Business, confirmed by the provider's webhook.
    await nav(page, "Billing");
    const business = page
      .locator(".card")
      .filter({ has: page.getByRole("button", { name: /Choose Business/ }) });
    await business.getByRole("button", { name: /Choose Business/ }).click();
    await page.waitForURL(/checkout=success/);
    await confirmCheckout(page, baseURL, shop.orgId, "business");
    await page.reload();
    await expect(page.getByRole("heading", { name: /^Business · / })).toBeVisible();

    await nav(page, "Members");
    await page.getByPlaceholder("Email to invite").fill(invitee);
    await page.locator("form select").selectOption("viewer");
    await page.getByRole("button", { name: "Send invitation" }).click();
    const shown = page.getByText(/Send this link to/).locator("code");
    await expect(shown).toBeVisible();
    const link = new URL((await shown.textContent()) ?? "");
    expect(link.pathname).toBe("/invite");
    const invitePath = `${link.pathname}${link.search}`;

    // Signed in with a different address: refused, and not a member.
    const other = await stranger.newPage();
    await signUpWithShop(other, { tag: "inv-stranger", shop: "Somebody Else" });
    await other.goto(invitePath);
    await other.getByRole("button", { name: "Accept invitation" }).click();
    await expect(
      other.getByText("This invitation was sent to a different email address."),
    ).toBeVisible();
    expect((await other.request.get(`/api/orgs/${shop.orgId}/sales`)).status()).toBe(404);

    // The invited address: the link offers sign-up, which comes back to the invitation.
    const g = await guest.newPage();
    await g.goto(invitePath);
    await expect(g.getByRole("heading", { name: "You're invited" })).toBeVisible();
    await g.getByRole("link", { name: "create an account" }).click();
    await labelled(g, "Your name").fill("E2E Bookkeeper");
    await labelled(g, "Email").fill(invitee);
    await labelled(g, "Password (10+ characters)").fill("e2e-password-only");
    await g.getByRole("button", { name: "Create account" }).click();
    const accept = g.getByRole("button", { name: "Accept invitation" });
    const agree = g.getByRole("button", { name: "I agree" });
    await expect(accept.or(agree)).toBeVisible();
    if (await agree.isVisible()) await agree.click();
    await accept.click();
    await g.waitForURL(new RegExp(`/o/${shop.orgId}$`));
    // The viewer reads the shop's sales (the terms are asked once per person, here if not at
    // sign-up); every write is refused.
    await nav(g, "Sales");
    const terms = g.getByRole("button", { name: "I agree" });
    const salesHeading = g.getByRole("heading", { name: "Sales", exact: true });
    await expect(terms.or(salesHeading)).toBeVisible();
    if (await terms.isVisible()) await terms.click();
    await expect(g.getByText("Vintage Levi's 501 jeans 32x30").first()).toBeVisible();
    const write = await g.request.post(`/api/orgs/${shop.orgId}/expenses`, {
      headers: { Origin: baseURL ?? "" },
      data: { date: "2026-05-05", category: "supplies", amountCents: 100 },
    });
    expect(write.status()).toBe(403);
    // The same write from the owner is accepted, so the refusal was the viewer's role.
    const ownerWrite = await page.request.post(`/api/orgs/${shop.orgId}/expenses`, {
      headers: { Origin: baseURL ?? "" },
      data: { date: "2026-05-05", category: "supplies", amountCents: 100 },
    });
    expect(ownerWrite.ok()).toBe(true);

    // The same link cannot be used twice.
    const again = await g.request.post("/api/invitations/accept", {
      headers: { Origin: baseURL ?? "" },
      data: { token: link.searchParams.get("token") },
    });
    expect(again.status()).toBe(404);

    // The owner sees the viewer and removes them; the shop is then closed to them.
    await page.reload();
    const row = page.getByRole("row", { name: new RegExp(invitee) });
    await expect(row).toContainText("viewer");
    await row.getByRole("button", { name: "Remove" }).click();
    await expect(page.getByRole("row", { name: new RegExp(invitee) })).toHaveCount(0);
    expect((await g.request.get(`/api/orgs/${shop.orgId}/sales`)).status()).toBe(404);
  } finally {
    await owner.close();
    await stranger.close();
    await guest.close();
  }
});
