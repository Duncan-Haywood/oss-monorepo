import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const TEST_API_SECRET = "test-convex-api-secret";

beforeEach(() => {
  process.env.CONVEX_API_SECRET = TEST_API_SECRET;
});

afterEach(() => {
  delete process.env.CONVEX_API_SECRET;
});

interface LeadRow {
  slug: string;
  businessName: string;
  category: string;
  stage: string;
  dataSource?: string;
  outreachStep?: number;
  lastOutreachAt?: string;
  lastPreviewOpenAt?: string;
  notes?: string;
  snoozedUntil?: string;
}

function newLeadArgs(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    slug: "demo-cafe",
    businessName: "Demo Cafe",
    category: "restaurant" as const,
    city: "Boulder",
    state: "CO",
    tagline: "Fresh daily",
    description: "A cozy neighborhood cafe.",
    phone: "(555) 000-0000",
    services: ["coffee", "pastries"],
    hours: { weekday: "Mon-Fri 7am-5pm", weekend: "Sat-Sun 8am-2pm" },
    stage: "discovered" as const,
    recommendedTier: "growth" as const,
    ...overrides,
  };
}

/** upsertLead/seed's nested-item args need the apiSecret field, list/getBySlug/etc. don't take lead fields at all. */
function upsertArgs(overrides: Partial<Record<string, unknown>> = {}) {
  return { ...newLeadArgs(overrides), apiSecret: TEST_API_SECRET };
}

test("list returns leads newest-first (matches SQLite ORDER BY createdAt DESC)", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(api.leads.upsertLead, upsertArgs({ slug: "lead-a" }));
  await t.mutation(api.leads.upsertLead, upsertArgs({ slug: "lead-b" }));
  await t.mutation(api.leads.upsertLead, upsertArgs({ slug: "lead-c" }));

  const rows: LeadRow[] = await t.query(api.leads.list, { apiSecret: TEST_API_SECRET });
  expect(rows.map((r) => r.slug)).toEqual(["lead-c", "lead-b", "lead-a"]);
});

test("getBySlug returns null for an unknown slug and the row for a known one", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(api.leads.upsertLead, upsertArgs({ slug: "demo-cafe" }));

  const missing = await t.query(api.leads.getBySlug, {
    slug: "no-such-lead",
    apiSecret: TEST_API_SECRET,
  });
  expect(missing).toBeNull();

  const found: LeadRow | null = await t.query(api.leads.getBySlug, {
    slug: "demo-cafe",
    apiSecret: TEST_API_SECRET,
  });
  expect(found?.slug).toBe("demo-cafe");
});

test("updateStage throws on an unknown slug (parity with SQLite's existence-check-then-throw) and patches an existing lead", async () => {
  const t = convexTest(schema, modules);
  await expect(
    t.mutation(api.leads.updateStage, {
      slug: "no-such-lead",
      stage: "paid",
      apiSecret: TEST_API_SECRET,
    }),
  ).rejects.toThrow("Lead with slug no-such-lead not found");

  await t.mutation(api.leads.upsertLead, upsertArgs({ slug: "demo-cafe", stage: "discovered" }));
  await t.mutation(api.leads.updateStage, {
    slug: "demo-cafe",
    stage: "live",
    apiSecret: TEST_API_SECRET,
  });
  const row: LeadRow | null = await t.query(api.leads.getBySlug, {
    slug: "demo-cafe",
    apiSecret: TEST_API_SECRET,
  });
  expect(row?.stage).toBe("live");
});

test("upsertLead inserts a new lead then patches (not duplicates) the existing row on a second call", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(api.leads.upsertLead, upsertArgs({ slug: "demo-cafe", businessName: "Demo Cafe" }));
  await t.mutation(
    api.leads.upsertLead,
    upsertArgs({ slug: "demo-cafe", businessName: "Demo Cafe Updated" }),
  );

  const rows: LeadRow[] = await t.query(api.leads.list, { apiSecret: TEST_API_SECRET });
  expect(rows).toHaveLength(1);
  expect(rows[0].businessName).toBe("Demo Cafe Updated");
});

test("markLeadPaid is idempotent on stripeSessionId and inserts a paid stub lead using the canonical payment-stub defaults when none exists", async () => {
  const t = convexTest(schema, modules);
  const first = await t.mutation(api.leads.markLeadPaid, {
    slug: "organic-widgets",
    stripeSessionId: "cs_test_1",
    customerEmail: "buyer@example.com",
    tier: "growth",
    commerceAddon: false,
    amountTotal: 9900,
    apiSecret: TEST_API_SECRET,
  });
  expect(first.alreadyRecorded).toBe(false);

  // Redelivery of the same Stripe session must not insert a second stub lead
  // or a second order.
  const second = await t.mutation(api.leads.markLeadPaid, {
    slug: "organic-widgets",
    stripeSessionId: "cs_test_1",
    customerEmail: "buyer@example.com",
    tier: "growth",
    commerceAddon: false,
    amountTotal: 9900,
    apiSecret: TEST_API_SECRET,
  });
  expect(second.alreadyRecorded).toBe(true);

  const leads: LeadRow[] = await t.query(api.leads.list, { apiSecret: TEST_API_SECRET });
  expect(leads).toHaveLength(1);
  const stub = leads[0];
  // Stub fields must match src/lib/leads/payment-stub.ts's
  // buildPaymentStubLeadFields — the canonical helper, not a private copy.
  expect(stub.slug).toBe("organic-widgets");
  expect(stub.businessName).toBe("Organic Widgets");
  expect(stub.category).toBe("generic");
  expect(stub.stage).toBe("paid");
  expect(stub.dataSource).toBe("payment_stub");
});

test("markLeadPaid moves an existing lead's stage to paid rather than inserting a stub", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(api.leads.upsertLead, upsertArgs({ slug: "demo-cafe", stage: "outreach_sent" }));

  await t.mutation(api.leads.markLeadPaid, {
    slug: "demo-cafe",
    stripeSessionId: "cs_test_2",
    customerEmail: "owner@demo-cafe.example",
    tier: "growth",
    commerceAddon: false,
    amountTotal: 9900,
    apiSecret: TEST_API_SECRET,
  });

  const leads: LeadRow[] = await t.query(api.leads.list, { apiSecret: TEST_API_SECRET });
  expect(leads).toHaveLength(1);
  expect(leads[0].stage).toBe("paid");
  expect(leads[0].businessName).toBe("Demo Cafe");
});

test("recordOutreach throws on an unknown slug and patches step + timestamp on a known one", async () => {
  const t = convexTest(schema, modules);
  await expect(
    t.mutation(api.leads.recordOutreach, {
      slug: "no-such-lead",
      outreachStep: 1,
      lastOutreachAt: "2026-01-01T00:00:00.000Z",
      apiSecret: TEST_API_SECRET,
    }),
  ).rejects.toThrow("Lead with slug no-such-lead not found");

  await t.mutation(api.leads.upsertLead, upsertArgs({ slug: "demo-cafe" }));
  await t.mutation(api.leads.recordOutreach, {
    slug: "demo-cafe",
    outreachStep: 2,
    lastOutreachAt: "2026-02-01T00:00:00.000Z",
    apiSecret: TEST_API_SECRET,
  });
  const row: LeadRow | null = await t.query(api.leads.getBySlug, {
    slug: "demo-cafe",
    apiSecret: TEST_API_SECRET,
  });
  expect(row?.outreachStep).toBe(2);
  expect(row?.lastOutreachAt).toBe("2026-02-01T00:00:00.000Z");
});

test("recordPreviewOpen no-ops (never throws) on an unknown slug, unlike every other lead mutation", async () => {
  const t = convexTest(schema, modules);
  await expect(
    t.mutation(api.leads.recordPreviewOpen, {
      slug: "no-such-lead",
      openedAt: "2026-01-01T00:00:00.000Z",
      apiSecret: TEST_API_SECRET,
    }),
  ).resolves.toBeNull();

  await t.mutation(api.leads.upsertLead, upsertArgs({ slug: "demo-cafe" }));
  await t.mutation(api.leads.recordPreviewOpen, {
    slug: "demo-cafe",
    openedAt: "2026-03-01T00:00:00.000Z",
    apiSecret: TEST_API_SECRET,
  });
  const row: LeadRow | null = await t.query(api.leads.getBySlug, {
    slug: "demo-cafe",
    apiSecret: TEST_API_SECRET,
  });
  expect(row?.lastPreviewOpenAt).toBe("2026-03-01T00:00:00.000Z");
});

test("updateNotes / updateSnooze throw on an unknown slug and an empty string clears the field", async () => {
  const t = convexTest(schema, modules);
  await expect(
    t.mutation(api.leads.updateNotes, {
      slug: "no-such-lead",
      notes: "hi",
      apiSecret: TEST_API_SECRET,
    }),
  ).rejects.toThrow("Lead with slug no-such-lead not found");
  await expect(
    t.mutation(api.leads.updateSnooze, {
      slug: "no-such-lead",
      snoozedUntil: "2026-01-01T00:00:00.000Z",
      apiSecret: TEST_API_SECRET,
    }),
  ).rejects.toThrow("Lead with slug no-such-lead not found");

  await t.mutation(api.leads.upsertLead, upsertArgs({ slug: "demo-cafe" }));
  await t.mutation(api.leads.updateNotes, {
    slug: "demo-cafe",
    notes: "Called, interested",
    apiSecret: TEST_API_SECRET,
  });
  await t.mutation(api.leads.updateSnooze, {
    slug: "demo-cafe",
    snoozedUntil: "2026-04-01T00:00:00.000Z",
    apiSecret: TEST_API_SECRET,
  });
  let row: LeadRow | null = await t.query(api.leads.getBySlug, {
    slug: "demo-cafe",
    apiSecret: TEST_API_SECRET,
  });
  expect(row?.notes).toBe("Called, interested");
  expect(row?.snoozedUntil).toBe("2026-04-01T00:00:00.000Z");

  // Empty string (or omitted) clears both — Convex patch ignores `undefined`
  // keys, so the handler must coerce to "" for the clear to persist.
  await t.mutation(api.leads.updateNotes, { slug: "demo-cafe", apiSecret: TEST_API_SECRET });
  await t.mutation(api.leads.updateSnooze, { slug: "demo-cafe", apiSecret: TEST_API_SECRET });
  row = await t.query(api.leads.getBySlug, { slug: "demo-cafe", apiSecret: TEST_API_SECRET });
  expect(row?.notes).toBe("");
  expect(row?.snoozedUntil).toBe("");
});

test("applyColdDisposition throws on an unknown slug and patches stage/outreach/snooze together, clearing via empty string", async () => {
  const t = convexTest(schema, modules);
  await expect(
    t.mutation(api.leads.applyColdDisposition, {
      slug: "no-such-lead",
      stage: "closed",
      outreachStep: 0,
      apiSecret: TEST_API_SECRET,
    }),
  ).rejects.toThrow("Lead with slug no-such-lead not found");

  await t.mutation(
    api.leads.upsertLead,
    upsertArgs({
      slug: "demo-cafe",
      stage: "outreach_sent",
      outreachStep: 3,
      lastOutreachAt: "2026-01-01T00:00:00.000Z",
      snoozedUntil: "2026-05-01T00:00:00.000Z",
    }),
  );

  // Re-engage: clear snooze + outreach timestamp, move stage back to outreach_sent.
  await t.mutation(api.leads.applyColdDisposition, {
    slug: "demo-cafe",
    stage: "outreach_sent",
    outreachStep: 0,
    apiSecret: TEST_API_SECRET,
  });
  const row: LeadRow | null = await t.query(api.leads.getBySlug, {
    slug: "demo-cafe",
    apiSecret: TEST_API_SECRET,
  });
  expect(row?.stage).toBe("outreach_sent");
  expect(row?.outreachStep).toBe(0);
  expect(row?.lastOutreachAt).toBe("");
  expect(row?.snoozedUntil).toBe("");
});

test("applyColdDisposition returns true and applies the patch on a clean cold lead", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(
    api.leads.upsertLead,
    upsertArgs({ slug: "clean-cafe", stage: "outreach_sent", outreachStep: 3 }),
  );

  const applied = await t.mutation(api.leads.applyColdDisposition, {
    slug: "clean-cafe",
    stage: "closed",
    outreachStep: 3,
    apiSecret: TEST_API_SECRET,
  });
  expect(applied).toBe(true);

  const row: LeadRow | null = await t.query(api.leads.getBySlug, {
    slug: "clean-cafe",
    apiSecret: TEST_API_SECRET,
  });
  expect(row?.stage).toBe("closed");
});

test("applyColdDisposition returns false and skips the write when the fresh row already went paid/live (cold-lead-disposition-paid-live-race-guard)", async () => {
  // Reproduces disposeColdLeadAction's TOCTOU window: the operator's earlier
  // planColdLeadDisposition read saw a cold, unpaid lead, but a concurrent
  // Stripe checkout (updateStage here stands in for recordLeadPayment)
  // completed in between — the disposition write must not revert that.
  const t = convexTest(schema, modules);
  await t.mutation(
    api.leads.upsertLead,
    upsertArgs({ slug: "race-cafe", stage: "outreach_sent", outreachStep: 3 }),
  );
  await t.mutation(api.leads.updateStage, {
    slug: "race-cafe",
    stage: "paid",
    apiSecret: TEST_API_SECRET,
  });

  const applied = await t.mutation(api.leads.applyColdDisposition, {
    slug: "race-cafe",
    stage: "closed",
    outreachStep: 3,
    apiSecret: TEST_API_SECRET,
  });
  expect(applied).toBe(false);

  const row: LeadRow | null = await t.query(api.leads.getBySlug, {
    slug: "race-cafe",
    apiSecret: TEST_API_SECRET,
  });
  expect(row?.stage).toBe("paid");
  expect(row?.outreachStep).toBe(3);
});

test("applyColdDisposition also rejects a fresh 'live' row the same way", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(
    api.leads.upsertLead,
    upsertArgs({ slug: "live-cafe", stage: "outreach_sent", outreachStep: 3 }),
  );
  await t.mutation(api.leads.updateStage, {
    slug: "live-cafe",
    stage: "live",
    apiSecret: TEST_API_SECRET,
  });

  const applied = await t.mutation(api.leads.applyColdDisposition, {
    slug: "live-cafe",
    stage: "discovered",
    outreachStep: 0,
    apiSecret: TEST_API_SECRET,
  });
  expect(applied).toBe(false);

  const row: LeadRow | null = await t.query(api.leads.getBySlug, {
    slug: "live-cafe",
    apiSecret: TEST_API_SECRET,
  });
  expect(row?.stage).toBe("live");
});

test("seed inserts leads only when the table is empty, and is a no-op afterwards", async () => {
  const t = convexTest(schema, modules);
  const first = await t.mutation(api.leads.seed, {
    leads: [newLeadArgs({ slug: "seed-lead" })],
    apiSecret: TEST_API_SECRET,
  });
  expect(first.count).toBe(1);
  expect(first.message).toBe("Database seeded successfully");

  const second = await t.mutation(api.leads.seed, {
    leads: [newLeadArgs({ slug: "another-lead" })],
    apiSecret: TEST_API_SECRET,
  });
  expect(second.count).toBe(1);
  expect(second.message).toBe("Database already seeded");

  const rows: LeadRow[] = await t.query(api.leads.list, { apiSecret: TEST_API_SECRET });
  expect(rows).toHaveLength(1);
  expect(rows[0].slug).toBe("seed-lead");
});

test("markLeadPaid (the highest-severity function in this file — forges a paid order with zero Stripe involvement) rejects a missing/wrong apiSecret", async () => {
  const t = convexTest(schema, modules);
  await expect(
    t.mutation(api.leads.markLeadPaid, {
      slug: "organic-widgets",
      stripeSessionId: "cs_test_attack",
      customerEmail: "attacker@example.com",
      tier: "complete",
      commerceAddon: true,
      amountTotal: 9900,
      apiSecret: "wrong-secret",
    }),
  ).rejects.toThrow(/Unauthorized/);
  // No order or stub lead was created by the rejected call.
  const leads: LeadRow[] = await t.query(api.leads.list, { apiSecret: TEST_API_SECRET });
  expect(leads).toHaveLength(0);
});

test("list and upsertLead reject any caller when CONVEX_API_SECRET is unset, even a plausible-looking guess", async () => {
  delete process.env.CONVEX_API_SECRET;
  const t = convexTest(schema, modules);
  await expect(t.query(api.leads.list, { apiSecret: TEST_API_SECRET })).rejects.toThrow(/Unauthorized/);
  await expect(
    t.mutation(api.leads.upsertLead, upsertArgs({ slug: "demo-cafe" })),
  ).rejects.toThrow(/Unauthorized/);
});
