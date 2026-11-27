// The pages behind the account emails, in the browser. Offline, mail goes to an in-memory fake nobody
// can open, so each spec takes what the email would have carried from where the server keeps it:
// the reset token from the local D1 (Better Auth stores it as `reset-password:<token>`), and the
// confirmation link's token signed as Better Auth signs it (an HS256 JWT over the address with the
// server's AUTH_SECRET, which is the e2e-only one here).
import { expect, test } from "@playwright/test";
import { signJWT } from "better-auth/crypto";
import { d1Query, signIn, signUpWithShop } from "./helpers";
import { E2E_AUTH_SECRET } from "./secret";

const OLD_PASSWORD = "e2e-password-only";
const NEW_PASSWORD = "a-new-e2e-password";

const sqlText = (s: string) => s.replace(/'/g, "''");

test("a forgotten password is reset from the emailed link, and the old one and old sessions stop working", async ({
  browser,
}) => {
  const first = await browser.newContext();
  const second = await browser.newContext();
  try {
    // Signed in on one device; the reset happens on another.
    const kept = await first.newPage();
    const { email, orgId } = await signUpWithShop(kept, { tag: "reset", shop: "Forgetful Resale" });
    expect((await kept.request.get(`/api/orgs/${orgId}/sales`)).status()).toBe(200);

    const page = await second.newPage();
    await page.goto("/login");
    await page.getByRole("link", { name: "Forgot password?" }).click();
    await page.getByPlaceholder("Email").fill(email);
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page.getByText(`If ${email} has an account, we've sent a link`)).toBeVisible();

    // An address with no account gets the same answer (no account probing).
    await page.goto("/forgot-password");
    await page.getByPlaceholder("Email").fill("nobody-here@example.test");
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page.getByText("If nobody-here@example.test has an account")).toBeVisible();

    const rows = d1Query<{ identifier: string }>(
      `SELECT v.identifier FROM verification v JOIN "user" u ON u.id = v.value WHERE u.email = '${sqlText(email)}' AND v.identifier LIKE 'reset-password:%'`,
    );
    expect(rows).toHaveLength(1);
    const token = (rows[0]?.identifier ?? "").slice("reset-password:".length);
    expect(token.length).toBeGreaterThan(10);

    // A link without its token says so.
    await page.goto("/reset-password");
    await expect(page.getByRole("heading", { name: "Reset link incomplete" })).toBeVisible();

    await page.goto(`/reset-password?token=${encodeURIComponent(token)}`);
    await page.getByPlaceholder(/New password/).fill(NEW_PASSWORD);
    await page.getByPlaceholder("Repeat the new password").fill(`${NEW_PASSWORD}-typo`);
    await page.getByRole("button", { name: "Change password" }).click();
    await expect(page.getByText("The passwords don't match.")).toBeVisible();
    await page.getByPlaceholder("Repeat the new password").fill(NEW_PASSWORD);
    await page.getByRole("button", { name: "Change password" }).click();
    await expect(page.getByRole("heading", { name: "Password changed" })).toBeVisible();

    // The link works once.
    await page.goto(`/reset-password?token=${encodeURIComponent(token)}`);
    await page.getByPlaceholder(/New password/).fill("yet-another-password");
    await page.getByPlaceholder("Repeat the new password").fill("yet-another-password");
    await page.getByRole("button", { name: "Change password" }).click();
    await expect(
      page.getByText("This reset link has expired or was already used. Request a new one."),
    ).toBeVisible();

    // The other device was signed out.
    expect((await kept.request.get(`/api/orgs/${orgId}/sales`)).status()).toBe(401);

    // The old password is refused; the new one opens the shop.
    await signIn(page, email, OLD_PASSWORD);
    await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
    await signIn(page, email, NEW_PASSWORD);
    await page.waitForURL(/\/(orgs|o\/[^/]+)$/);
    expect((await page.request.get(`/api/orgs/${orgId}/sales`)).status()).toBe(200);

    // Resetting by email proves the mailbox, so the address now counts as confirmed.
    const [verified] = d1Query<{ email_verified: number }>(
      `SELECT email_verified FROM "user" WHERE email = '${sqlText(email)}'`,
    );
    expect(verified?.email_verified).toBe(1);
  } finally {
    await first.close();
    await second.close();
  }
});

test("the confirmation link confirms the address, and a damaged one says so", async ({ page }) => {
  const { email } = await signUpWithShop(page, { tag: "verify", shop: "Confirming Resale" });
  const before = d1Query<{ id: string; email_verified: number }>(
    `SELECT id, email_verified FROM "user" WHERE email = '${sqlText(email)}'`,
  );
  expect(before[0]?.email_verified).toBe(0);

  await page.goto("/verify-email?token=not-a-real-token");
  await expect(page.getByRole("heading", { name: "We couldn't confirm your email" })).toBeVisible();
  await expect(page.getByText(/This link isn't valid/)).toBeVisible();

  const token = await signJWT(
    { email: email.toLowerCase(), userId: before[0]?.id },
    E2E_AUTH_SECRET,
    3600,
  );
  await page.goto(`/verify-email?token=${encodeURIComponent(token)}`);
  await expect(page.getByRole("heading", { name: "Email confirmed" })).toBeVisible();
  const after = d1Query<{ email_verified: number }>(
    `SELECT email_verified FROM "user" WHERE email = '${sqlText(email)}'`,
  );
  expect(after[0]?.email_verified).toBe(1);
});
