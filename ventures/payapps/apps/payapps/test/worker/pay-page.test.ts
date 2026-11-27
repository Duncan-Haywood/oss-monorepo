// The checkout page Paddle opens (routes/pay.ts) and the switch that keeps Paddle checkout off until
// its client-side token is set (ports/billing.ts).
import { createBillingProvider } from "@worker/ports/billing";
import { PAY_CSP, PAY_SCRIPT, payPageHtml } from "@worker/routes/pay";
import { describe, expect, it } from "vitest";
import { BASE, call, setupTenant, worker } from "./helpers";

// Built at run time so no token-shaped literal sits in the tree.
const liveToken = `live_${"a1b2c3".repeat(5)}`;
const sandboxToken = `test_${"z9y8".repeat(7)}`;

describe("GET /pay", () => {
  it("serves the page with Paddle's CSP and a popup-friendly COOP", async () => {
    const res = await worker.fetch(new Request(`${BASE}/pay?_ptxn=txn_01abc`));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/text\/html/);
    expect(res.headers.get("content-security-policy")).toBe(PAY_CSP);
    expect(res.headers.get("cross-origin-opener-policy")).toBe("same-origin-allow-popups");
    expect(res.headers.get("x-frame-options")).toBe("DENY");
    expect(res.headers.get("cache-control")).toBe("no-store");
    const html = await res.text();
    // The test deployment has no client-side token: no third-party script, a plain message.
    expect(html).not.toContain("cdn.paddle.com");
    expect(html).toContain("Checkout is not available");
    expect(html).toContain(`href="${BASE}/?checkout=cancel"`);
  });

  it("returns to the org's Billing page, and ignores an org id of the wrong shape", async () => {
    const { orgId } = await setupTenant();
    const ok = await (await worker.fetch(new Request(`${BASE}/pay/${orgId}?_ptxn=txn_1`))).text();
    expect(ok).toContain(`data-success="${BASE}/orgs/${orgId}/billing?checkout=success"`);
    expect(ok).toContain(`data-cancel="${BASE}/orgs/${orgId}/billing?checkout=cancel"`);
    const bad = await (
      await worker.fetch(new Request(`${BASE}/pay/${encodeURIComponent('"><script>x')}`))
    ).text();
    expect(bad).not.toContain("<script>x");
    expect(bad).toContain(`data-success="${BASE}/?checkout=success"`);
  });

  it("serves its own script same-origin, never inline", async () => {
    const res = await worker.fetch(new Request(`${BASE}/pay/checkout.js`));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/javascript/);
    expect(await res.text()).toBe(PAY_SCRIPT);
  });

  it("leaves every other response on COOP same-origin", async () => {
    const res = await worker.fetch(new Request(`${BASE}/api/health`));
    expect(res.headers.get("cross-origin-opener-policy")).toBe("same-origin");
  });
});

describe("payPageHtml with a token", () => {
  it("loads Paddle.js and names the environment from the token", () => {
    const live = payPageHtml({
      token: liveToken,
      successUrl: "https://a/s",
      cancelUrl: "https://a/c",
    });
    expect(live).toContain('<script src="https://cdn.paddle.com/paddle/v2/paddle.js"></script>');
    expect(live).toContain('<script src="/pay/checkout.js" defer></script>');
    expect(live).toContain(`data-token="${liveToken}" data-environment="production"`);
    const sandbox = payPageHtml({ token: sandboxToken, successUrl: "s", cancelUrl: "c" });
    expect(sandbox).toContain('data-environment="sandbox"');
    // No inline script: the CSP allows only 'self' and cdn.paddle.com.
    expect(live).not.toContain("<script>");
  });
});

describe("checkout sends Paddle to /pay/<org>", () => {
  it("passes the org's pay page on the checkout request", async () => {
    const { orgId, userId } = await setupTenant();
    const { url } = await call<{ url: string }>(`/api/orgs/${orgId}/billing/checkout`, {
      method: "POST",
      as: userId,
      json: { plan: "solo", interval: "month" },
    });
    // The fake provider returns to the success URL; the real one gets checkoutPageUrl (unit-tested in
    // packages/billing). Here: checkout still works with the new field.
    expect(url).toContain(`/orgs/${orgId}/billing?checkout=success`);
  });
});

describe("createBillingProvider", () => {
  const base = {
    APP_ENV: "production",
    BILLING_PROVIDER: "paddle",
    BILLING_API_KEY: ["pdl", "live", "apikey", "placeholder"].join("_"),
    BILLING_WEBHOOK_SECRET: "pdl_ntfset_placeholder_placeholder",
    BILLING_PRICE_IDS: '{"solo":"pri_1"}',
  } as Parameters<typeof createBillingProvider>[0];

  it("keeps Paddle checkout off without a client-side token", () => {
    expect(createBillingProvider(base)).toBeNull();
    expect(
      createBillingProvider({
        ...base,
        BILLING_CLIENT_TOKEN: ["pdl", "live", "apikey", "x"].join("_"),
      }),
    ).toBeNull();
  });

  it("turns it on with one", () => {
    expect(createBillingProvider({ ...base, BILLING_CLIENT_TOKEN: liveToken })).not.toBeNull();
  });
});
