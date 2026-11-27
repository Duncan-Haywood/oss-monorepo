import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addMoney,
  adminActorMayAccess,
  bearerToken,
  canReadAccounts,
  dailyDigestEmail,
  dayBuckets,
  isPlatformAdminEmail,
  MIN_SERVICE_TOKEN_LENGTH,
  monthlyRecurringMinor,
  newPaidSubscriptionEmail,
  ownerRecipients,
  parseAdminEmails,
  resolveAdminActor,
  serviceTokenScope,
  summarizeMrr,
  verifyServiceToken,
  weekBuckets,
  weekStart,
} from "./index.ts";

const TOKEN = "t".repeat(MIN_SERVICE_TOKEN_LENGTH);

describe("admin gate", () => {
  it("accepts only a verified email on the list (case-insensitive)", () => {
    const raw = " Owner@Example.com , ops@example.com,not-an-email";
    assert.deepEqual(parseAdminEmails(raw), ["owner@example.com", "ops@example.com"]);
    assert.equal(
      isPlatformAdminEmail(raw, { email: "OWNER@example.com", emailVerified: true }),
      true,
    );
    assert.equal(
      isPlatformAdminEmail(raw, { email: "owner@example.com", emailVerified: false }),
      false,
    );
    assert.equal(
      isPlatformAdminEmail(raw, { email: "eve@example.com", emailVerified: true }),
      false,
    );
    assert.equal(
      isPlatformAdminEmail("", { email: "owner@example.com", emailVerified: true }),
      false,
    );
    assert.equal(isPlatformAdminEmail(undefined, null), false);
  });

  it("parses bearer headers", () => {
    assert.equal(bearerToken("Bearer abc"), "abc");
    assert.equal(bearerToken("bearer abc "), "abc");
    assert.equal(bearerToken("Basic abc"), null);
    assert.equal(bearerToken(null), null);
  });

  it("verifies the service token in constant time and refuses short or unset secrets", async () => {
    assert.equal(await verifyServiceToken(TOKEN, TOKEN), true);
    assert.equal(await verifyServiceToken(`${TOKEN}x`, TOKEN), false);
    assert.equal(await verifyServiceToken("short", "short"), false);
    assert.equal(await verifyServiceToken(TOKEN, undefined), false);
    assert.equal(await verifyServiceToken(null, TOKEN), false);
  });

  it("resolves the actor; a wrong bearer token is a denial even with an admin session", async () => {
    const admin = { id: "u1", email: "owner@example.com", emailVerified: true };
    const base = { serviceToken: TOKEN, adminEmails: "owner@example.com" };
    assert.deepEqual(
      await resolveAdminActor({ ...base, authorization: `Bearer ${TOKEN}`, user: null }),
      {
        type: "service",
        name: "admin-console",
        scope: "full",
      },
    );
    assert.deepEqual(await resolveAdminActor({ ...base, authorization: null, user: admin }), {
      type: "user",
      userId: "u1",
      scope: "full",
    });
    assert.equal(
      await resolveAdminActor({ ...base, authorization: "Bearer wrong", user: admin }),
      null,
    );
    assert.equal(
      await resolveAdminActor({
        ...base,
        authorization: null,
        user: { ...admin, emailVerified: false },
      }),
      null,
    );
  });
});

describe("read-only metrics token", () => {
  const METRICS = "m".repeat(MIN_SERVICE_TOKEN_LENGTH);
  it("grants the metrics scope only, never the account lists", async () => {
    const actor = await resolveAdminActor({
      authorization: `Bearer ${METRICS}`,
      serviceToken: TOKEN,
      metricsToken: METRICS,
      adminEmails: "",
      user: null,
    });
    assert.deepEqual(actor, { type: "service", name: "metrics-agent", scope: "metrics" });
    assert.equal(actor && canReadAccounts(actor), false);
    assert.ok(actor);
    assert.equal(adminActorMayAccess(actor, "GET", "/api/admin/metrics"), true);
    assert.equal(adminActorMayAccess(actor, "GET", "/api/admin/accounts"), false);
    assert.equal(adminActorMayAccess(actor, "GET", "/api/admin/orgs"), false);
    assert.equal(adminActorMayAccess(actor, "POST", "/api/admin/metrics"), false);
    const consoleActor = { type: "service", name: "admin-console", scope: "full" } as const;
    assert.equal(adminActorMayAccess(consoleActor, "GET", "/api/admin/orgs"), true);
    assert.equal(adminActorMayAccess(consoleActor, "POST", "/api/admin/orgs/o/comp"), false);
    assert.equal(
      adminActorMayAccess({ type: "user", userId: "u", scope: "full" }, "POST", "/x"),
      true,
    );
    assert.equal(
      await serviceTokenScope(TOKEN, { serviceToken: TOKEN, metricsToken: METRICS }),
      "full",
    );
    assert.equal(
      await serviceTokenScope(METRICS, { serviceToken: TOKEN, metricsToken: METRICS }),
      "metrics",
    );
    assert.equal(await serviceTokenScope(METRICS, { serviceToken: TOKEN }), null);
    assert.equal(await serviceTokenScope("short", { metricsToken: "short" }), null);
  });
});

describe("MRR", () => {
  const price = {
    priceAmountMinor: 2900,
    priceCurrency: "USD",
    billingInterval: "month",
    billingFrequency: 1,
    priceQuantity: 1,
    priceDiscounted: false,
  };

  it("normalizes recorded month and year prices; never guesses the rest", () => {
    assert.deepEqual(monthlyRecurringMinor(price), { currency: "USD", amountMinor: 2900 });
    assert.deepEqual(
      monthlyRecurringMinor({ ...price, billingInterval: "year", priceAmountMinor: 29000 }),
      { currency: "USD", amountMinor: 2417 },
    );
    assert.deepEqual(monthlyRecurringMinor({ ...price, priceQuantity: 3 }), {
      currency: "USD",
      amountMinor: 8700,
    });
    assert.equal(monthlyRecurringMinor({ ...price, priceDiscounted: true }), null);
    assert.equal(monthlyRecurringMinor({ ...price, priceAmountMinor: null }), null);
    assert.equal(monthlyRecurringMinor({ ...price, billingInterval: "week" }), null);
  });

  it("sums paid rows per currency and counts unpriced ones separately", () => {
    const sum = summarizeMrr([
      { ...price, status: "active" },
      { ...price, status: "past_due", priceCurrency: "EUR", priceAmountMinor: 1000 },
      { ...price, status: "trialing" },
      { ...price, status: "canceled" },
      { ...price, status: "active", priceAmountMinor: null },
    ]);
    assert.deepEqual(sum.byCurrency, [
      { currency: "EUR", amountMinor: 1000 },
      { currency: "USD", amountMinor: 2900 },
    ]);
    assert.equal(sum.subscriptionsCounted, 2);
    assert.equal(sum.subscriptionsUnpriced, 1);
    assert.deepEqual(addMoney(sum.byCurrency, [{ currency: "USD", amountMinor: 100 }]), [
      { currency: "EUR", amountMinor: 1000 },
      { currency: "USD", amountMinor: 3000 },
    ]);
  });
});

describe("buckets", () => {
  const now = new Date("2026-11-26T15:00:00Z"); // a Thursday
  it("zero-fills each UTC day of the window and counts verified", () => {
    const b = dayBuckets(
      [
        { at: new Date("2026-11-26T01:00:00Z"), verified: true },
        { at: new Date("2026-11-26T23:00:00Z"), verified: false },
        { at: new Date("2026-11-24T00:00:00Z"), verified: true },
        { at: new Date("2026-11-01T00:00:00Z"), verified: true }, // outside
      ],
      now,
      3,
    );
    assert.deepEqual(b, [
      { day: "2026-11-24", total: 1, verified: 1 },
      { day: "2026-11-25", total: 0, verified: 0 },
      { day: "2026-11-26", total: 2, verified: 1 },
    ]);
    assert.equal(dayBuckets([], now, 1, false)[0]?.verified, null);
  });
  it("groups ISO weeks starting Monday", () => {
    assert.equal(weekStart(now).toISOString(), "2026-11-23T00:00:00.000Z");
    const w = weekBuckets([{ at: new Date("2026-11-22T12:00:00Z"), verified: true }], now, 2);
    assert.deepEqual(w, [
      { weekStart: "2026-11-16", total: 1, verified: 1 },
      { weekStart: "2026-11-23", total: 0, verified: 0 },
    ]);
  });
});

describe("owner notifications", () => {
  it("are off unless switched on, a sender is configured and an admin is named", () => {
    const env = { OWNER_NOTIFICATIONS: "on", PLATFORM_ADMIN_EMAILS: "owner@example.com" };
    assert.deepEqual(ownerRecipients(env, true), ["owner@example.com"]);
    assert.deepEqual(ownerRecipients(env, false), []);
    assert.deepEqual(ownerRecipients({ ...env, OWNER_NOTIFICATIONS: "off" }, true), []);
    assert.deepEqual(ownerRecipients({ OWNER_NOTIFICATIONS: "on" }, true), []);
  });

  it("new paid email carries only name, email, org and plan, on one line each", () => {
    const e = newPaidSubscriptionEmail({
      productName: "PayPencil",
      orgName: "Acme\r\nBcc: x@y",
      planKey: "pro",
      ownerName: "Ann",
      ownerEmail: "ann@acme.test",
      mrr: { currency: "USD", amountMinor: 4900 },
    });
    assert.doesNotMatch(e.subject, /[\r\n]/);
    assert.match(e.text, /Organization: Acme Bcc: x@y/);
    assert.match(e.text, /USD 49\.00 per month/);
    const none = newPaidSubscriptionEmail({ productName: "P", orgName: "O", planKey: "p" });
    assert.match(none.text, /not recorded on this event/);
  });

  it("digest says when a product could not be read instead of showing zeros", () => {
    const e = dailyDigestEmail({
      day: "2026-11-26",
      mrr: [],
      products: [
        {
          productName: "A",
          ok: false,
          error: "HTTP 500",
          signups: [],
          trialsStarted: [],
          cancellations: [],
        },
        {
          productName: "B",
          ok: true,
          signups: [
            {
              id: "s1",
              email: "x@y.test",
              name: null,
              source: "/",
              confirmed: true,
              createdAt: "",
            },
          ],
          trialsStarted: [],
          cancellations: [],
        },
      ],
    });
    assert.match(e.text, /Could not read this product: HTTP 500/);
    assert.match(e.subject, /1 sign-ups/);
    assert.match(e.text, /none recorded/);
  });
});
