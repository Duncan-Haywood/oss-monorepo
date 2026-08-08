import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The paid-order path, against the real `@/lib/db` — not a mock of it.
 *
 * Every other suite that touches these functions does `vi.mock("@/lib/db")`
 * (38 files do). That is why the defect this file pins survived: a mocked
 * `insertCommerceOrder` resolves happily, so the route tests proved the webhook
 * returns 200 without any claim about where — or whether — the sale was stored.
 *
 * What the real module did: with `NEXT_PUBLIC_CONVEX_URL` unset, `convexClient`
 * is null, no Convex call is attempted, and the order is written to SQLite at
 * `process.cwd()/local.db`. The Deployment mounts no volume, so that file is on
 * the container's writable layer and is destroyed by the next restart — after
 * Stripe has been told 200 and has stopped redelivering.
 *
 * Both directions are asserted here, because the fix has to leave the venture's
 * documented demo mode alone: `.env.example` says SQLite-only "is fine for solo
 * local demos" but that a real Convex URL is "required before first paid
 * order". Only the second is refused.
 *
 * These tests `chdir` into a temp directory before importing the module,
 * because `db.ts` resolves both the Convex URL and the SQLite path at module
 * load. `fileParallelism: false` / `maxWorkers: 1` in vitest.config.ts make
 * that safe.
 */

// `db.ts` opens with `import "server-only"`, whose whole job is to throw
// outside a server component. Stubbing it is what makes the module importable
// at all — and is the likeliest reason no test ever exercised it. This mocks a
// dependency of the subject, never the subject: `@/lib/db` itself is real here.
vi.mock("server-only", () => ({}));

const WEBHOOK_OPTIONS = { requireConvex: true, requireDurableLedger: true } as const;

const ORDER = {
  leadSlug: "acme-plumbing",
  skuId: "sku_gutter_clean",
  skuName: "Gutter clean",
  amountPaidUsd: 240,
  stripeSessionId: "cs_test_durable_ledger",
};

describe("paid-order writes refuse an ephemeral ledger", () => {
  let cwd: string;
  let sandbox: string;

  beforeEach(() => {
    cwd = process.cwd();
    sandbox = mkdtempSync(join(tmpdir(), "lss-ledger-"));
    process.chdir(sandbox);
    vi.resetModules();
    delete process.env.NEXT_PUBLIC_CONVEX_URL;
  });

  afterEach(() => {
    process.chdir(cwd);
    rmSync(sandbox, { recursive: true, force: true });
  });

  it("refuses a commerce order when Convex is unconfigured, and writes nothing", async () => {
    const { insertCommerceOrder } = await import("@/lib/db");

    await expect(insertCommerceOrder(ORDER, WEBHOOK_OPTIONS)).rejects.toThrow(
      /NEXT_PUBLIC_CONVEX_URL is not configured/,
    );

    // The point of the refusal: no local.db was opened, so there is no row
    // sitting in a file that the next pod restart deletes.
    expect(existsSync(join(sandbox, "local.db"))).toBe(false);
  });

  it("names the surface it refused, so the webhook log says which write failed", async () => {
    const { insertCommerceOrder } = await import("@/lib/db");

    await expect(insertCommerceOrder(ORDER, WEBHOOK_OPTIONS)).rejects.toMatchObject({
      name: "DurableLedgerUnavailableError",
      surface: "insertCommerceOrder",
    });
  });

  it("refuses the bundle payment write on the same condition", async () => {
    const { recordLeadPayment } = await import("@/lib/db");

    await expect(
      recordLeadPayment(
        {
          slug: "acme-plumbing",
          stripeSessionId: "cs_test_bundle",
          customerEmail: "buyer@example.test",
          tier: "complete",
          commerceAddon: false,
          amountTotal: 500,
        },
        WEBHOOK_OPTIONS,
      ),
    ).rejects.toMatchObject({ surface: "recordLeadPayment" });

    expect(existsSync(join(sandbox, "local.db"))).toBe(false);
  });

  it("leaves the solo-demo SQLite path working for callers that are not the paid-order path", async () => {
    const { insertCommerceOrder, getCommerceOrderByStripeSessionId } = await import("@/lib/db");

    // No `requireDurableLedger`: this is the local demo the venture documents
    // as fine, and it must still persist.
    await expect(insertCommerceOrder(ORDER)).resolves.toEqual({ alreadyRecorded: false });

    expect(existsSync(join(sandbox, "local.db"))).toBe(true);
    const stored = await getCommerceOrderByStripeSessionId(ORDER.stripeSessionId);
    expect(stored).toMatchObject({ skuId: ORDER.skuId, amountPaidUsd: ORDER.amountPaidUsd });
  });

  it("records the order normally once a Convex URL is configured", async () => {
    // Guard against a fix that refuses on something other than configuration —
    // e.g. one keyed on NODE_ENV, which would refuse forever.
    process.env.NEXT_PUBLIC_CONVEX_URL = "https://example-deployment.convex.cloud";
    vi.resetModules();
    const { insertCommerceOrder } = await import("@/lib/db");

    // Convex is configured, so the guard passes; the Convex call itself then
    // fails against a URL nothing serves, and `requireConvex` turns that into a
    // Convex write error rather than a silent SQLite write.
    await expect(insertCommerceOrder(ORDER, WEBHOOK_OPTIONS)).rejects.toThrow(
      /Convex write failed for insertCommerceOrder/,
    );
    expect(existsSync(join(sandbox, "local.db"))).toBe(false);
  });
});
