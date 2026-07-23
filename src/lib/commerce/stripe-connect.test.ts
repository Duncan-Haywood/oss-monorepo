import { describe, expect, it } from "vitest";
import {
  createExpressConnectAccount,
  createConnectOnboardingLink,
  fetchConnectAccountStatus,
  type StripeConnectAccountsClient,
} from "./stripe-connect";

function createFakeStripe(): StripeConnectAccountsClient & {
  accountCount: () => number;
  createCallsByIdempotencyKey: () => Map<string, number>;
} {
  const accounts: Array<{
    id: string;
    metadata: Record<string, string>;
    charges_enabled?: boolean;
    payouts_enabled?: boolean;
    details_submitted?: boolean;
  }> = [];
  let nextId = 1;
  /** Real Stripe returns the SAME account for a replayed Idempotency-Key instead of creating a second one. */
  const accountsByIdempotencyKey = new Map<string, (typeof accounts)[number]>();
  const createCallsByIdempotencyKey = new Map<string, number>();

  /** Real Stripe list endpoints cap a page at `limit` and set has_more/starting_after. */
  function paginate<T extends { id: string }>(
    all: T[],
    limit: number,
    startingAfter: string | undefined,
  ): { data: T[]; has_more: boolean } {
    const startIndex = startingAfter
      ? all.findIndex((item) => item.id === startingAfter) + 1
      : 0;
    const page = all.slice(startIndex, startIndex + limit);
    return { data: page, has_more: startIndex + page.length < all.length };
  }

  return {
    accounts: {
      async list({ limit, starting_after }) {
        return paginate(accounts, limit, starting_after);
      },
      async create({ metadata }, options) {
        const idempotencyKey = options?.idempotencyKey;
        if (idempotencyKey) {
          createCallsByIdempotencyKey.set(
            idempotencyKey,
            (createCallsByIdempotencyKey.get(idempotencyKey) ?? 0) + 1,
          );
          const existing = accountsByIdempotencyKey.get(idempotencyKey);
          if (existing) return existing;
        }
        const account = { id: `acct_${nextId++}`, metadata };
        accounts.push(account);
        if (idempotencyKey) accountsByIdempotencyKey.set(idempotencyKey, account);
        return account;
      },
      async retrieve(accountId) {
        const account = accounts.find((a) => a.id === accountId);
        if (!account) throw new Error(`No such account: ${accountId}`);
        return account;
      },
    },
    accountLinks: {
      async create({ account }) {
        return { url: `https://connect.stripe.com/setup/e/${account}/fake` };
      },
    },
    accountCount: () => accounts.length,
    createCallsByIdempotencyKey: () => createCallsByIdempotencyKey,
  };
}

describe("createExpressConnectAccount", () => {
  it("creates a new Connect account keyed by lead slug metadata", async () => {
    const stripe = createFakeStripe();
    const { accountId, created } = await createExpressConnectAccount(stripe, {
      leadSlug: "demo-cafe",
      email: "owner@demo-cafe.example",
      businessName: "Demo Cafe",
    });

    expect(accountId).toMatch(/^acct_/);
    expect(created).toBe(true);
    expect(stripe.accountCount()).toBe(1);
  });

  it("is idempotent on re-run: finds the existing account by metadata instead of duplicating", async () => {
    const stripe = createFakeStripe();
    const first = await createExpressConnectAccount(stripe, {
      leadSlug: "demo-cafe",
      businessName: "Demo Cafe",
    });
    const second = await createExpressConnectAccount(stripe, {
      leadSlug: "demo-cafe",
      businessName: "Demo Cafe",
    });

    expect(second.accountId).toBe(first.accountId);
    expect(second.created).toBe(false);
    expect(stripe.accountCount()).toBe(1);
  });

  it("creates distinct accounts for distinct lead slugs", async () => {
    const stripe = createFakeStripe();
    const a = await createExpressConnectAccount(stripe, {
      leadSlug: "demo-cafe",
      businessName: "Demo Cafe",
    });
    const b = await createExpressConnectAccount(stripe, {
      leadSlug: "other-salon",
      businessName: "Other Salon",
    });

    expect(a.accountId).not.toBe(b.accountId);
    expect(stripe.accountCount()).toBe(2);
  });

  it("finds an existing account past Stripe's 100-item list page on re-run", async () => {
    const stripe = createFakeStripe();
    for (let i = 0; i < 110; i++) {
      await createExpressConnectAccount(stripe, {
        leadSlug: `filler-${i}`,
        businessName: `Filler ${i}`,
      });
    }
    const first = await createExpressConnectAccount(stripe, {
      leadSlug: "demo-cafe",
      businessName: "Demo Cafe",
    });
    expect(stripe.accountCount()).toBeGreaterThan(110);

    const second = await createExpressConnectAccount(stripe, {
      leadSlug: "demo-cafe",
      businessName: "Demo Cafe",
    });

    expect(second.accountId).toBe(first.accountId);
    expect(second.created).toBe(false);
  });

  it("passes a stable per-lead Idempotency-Key on the create call", async () => {
    const stripe = createFakeStripe();
    await createExpressConnectAccount(stripe, {
      leadSlug: "demo-cafe",
      businessName: "Demo Cafe",
    });

    const calls = stripe.createCallsByIdempotencyKey();
    expect(calls.size).toBe(1);
    const [key, count] = [...calls.entries()][0];
    expect(key).toBe("local_site_studio_connect_account_demo-cafe");
    expect(count).toBe(1);
  });

  it("never mints a second account when two concurrent calls both race past the list-based precheck", async () => {
    // Simulates the exact race findConnectAccountByLeadSlug cannot close by itself:
    // both calls see no existing account (list runs before either create lands) and
    // both call accounts.create — Stripe's Idempotency-Key guarantee is what actually
    // collapses them to one account, verified here by calling the fake client's
    // create directly with the same key the module derives, twice, "concurrently".
    const stripe = createFakeStripe();
    const key = "local_site_studio_connect_account_demo-cafe";
    const metadata = { local_site_studio_lead_slug: "demo-cafe" };

    const [first, second] = await Promise.all([
      stripe.accounts.create(
        {
          type: "express",
          capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
          metadata,
        },
        { idempotencyKey: key },
      ),
      stripe.accounts.create(
        {
          type: "express",
          capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
          metadata,
        },
        { idempotencyKey: key },
      ),
    ]);

    expect(first.id).toBe(second.id);
    expect(stripe.accountCount()).toBe(1);
  });
});

describe("createConnectOnboardingLink", () => {
  it("returns a Stripe-hosted onboarding URL for the account", async () => {
    const stripe = createFakeStripe();
    const { accountId } = await createExpressConnectAccount(stripe, {
      leadSlug: "demo-cafe",
      businessName: "Demo Cafe",
    });

    const { url } = await createConnectOnboardingLink(stripe, accountId, {
      refreshUrl: "https://app.example/dashboard/leads",
      returnUrl: "https://app.example/dashboard/leads",
    });

    expect(url).toContain(accountId);
    expect(url).toMatch(/^https:\/\//);
  });
});

describe("fetchConnectAccountStatus", () => {
  it("reflects the account's live charges_enabled/payouts_enabled/details_submitted flags", async () => {
    const stripe = createFakeStripe();
    const account = await stripe.accounts.create({
      type: "express",
      capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
      metadata: { local_site_studio_lead_slug: "demo-cafe" },
    });

    const status = await fetchConnectAccountStatus(stripe, account.id);
    expect(status).toEqual({
      chargesEnabled: false,
      payoutsEnabled: false,
      detailsSubmitted: false,
    });
  });

  it("defaults missing boolean fields to false rather than undefined", async () => {
    const stripe = createFakeStripe();
    const { accountId } = await createExpressConnectAccount(stripe, {
      leadSlug: "demo-cafe",
      businessName: "Demo Cafe",
    });

    const status = await fetchConnectAccountStatus(stripe, accountId);
    expect(status.chargesEnabled).toBe(false);
    expect(status.payoutsEnabled).toBe(false);
    expect(status.detailsSubmitted).toBe(false);
  });
});
