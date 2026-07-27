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
  stripeConnectAccountId?: string;
  stripeConnectAccountCreatedAt?: string;
  stripeConnectChargesEnabled?: boolean;
  stripeConnectPayoutsEnabled?: boolean;
  stripeConnectDetailsSubmitted?: boolean;
  stripeConnectStatusCheckedAt?: string;
  bufferProfileIds?: string[];
  bufferPostedVariantKeys?: string[];
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

test("list and getBySlug never leak Convex's own _id/_creationTime system fields onto a Lead (leads-convex-query-return-validator-system-field-leak)", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(
    api.leads.upsertLead,
    upsertArgs({
      slug: "demo-cafe",
      address: "123 Main St",
      email: "owner@demo-cafe.test",
      notes: "called twice, interested",
      snoozedUntil: "2026-08-01T00:00:00.000Z",
    }),
  );

  const allowedKeys = new Set([
    "slug",
    "businessName",
    "category",
    "city",
    "state",
    "address",
    "tagline",
    "description",
    "phone",
    "email",
    "services",
    "hours",
    "stage",
    "recommendedTier",
    "dataSource",
    "outreachStep",
    "lastOutreachAt",
    "lastPreviewOpenAt",
    "notes",
    "snoozedUntil",
    "stripeConnectAccountId",
  ]);

  const rows = await t.query(api.leads.list, { apiSecret: TEST_API_SECRET });
  expect(rows).toHaveLength(1);
  expect(rows[0]).not.toHaveProperty("_id");
  expect(rows[0]).not.toHaveProperty("_creationTime");
  for (const key of Object.keys(rows[0])) {
    expect(allowedKeys.has(key)).toBe(true);
  }

  const row = await t.query(api.leads.getBySlug, {
    slug: "demo-cafe",
    apiSecret: TEST_API_SECRET,
  });
  expect(row).not.toBeNull();
  expect(row).not.toHaveProperty("_id");
  expect(row).not.toHaveProperty("_creationTime");
  for (const key of Object.keys(row as object)) {
    expect(allowedKeys.has(key)).toBe(true);
  }
});

test("list and getBySlug normalize an unrecognized stored category/recommendedTier to safe defaults, matching mapSqliteRowToLead (leads-category-tier-read-normalize-parity)", async () => {
  const t = convexTest(schema, modules);
  // The leads table stores category/recommendedTier as loose v.string()
  // (schema.ts), not the closed literal unions upsertLead's categoryValidator/
  // tierValidator enforce — insert out-of-union values directly to simulate a
  // legacy row or a hand-edited Convex dashboard value a bypassed write path
  // could produce. Unlike checkoutSessions' analogous "unrecognized kind stays
  // as-is" test above, category/recommendedTier must NOT pass through raw:
  // getCategoryTheme's CATEGORY_THEMES[category] lookup (src/lib/previews/themes.ts)
  // has no fallback and throws on an unrecognized key, crashing the public
  // /preview/[slug] page for that lead.
  await t.run(async (ctx) => {
    await ctx.db.insert("leads", {
      slug: "legacy-lead",
      businessName: "Legacy Lead",
      category: "not-a-real-category",
      city: "Boulder",
      state: "CO",
      tagline: "Fresh daily",
      description: "A cozy neighborhood cafe.",
      phone: "(555) 000-0000",
      services: ["coffee"],
      hours: { weekday: "Mon-Fri 7am-5pm", weekend: "Sat-Sun 8am-2pm" },
      stage: "discovered",
      recommendedTier: "not-a-real-tier",
    });
    await ctx.db.insert("leads", {
      slug: "legacy-trades-lead",
      businessName: "Legacy Trades Lead",
      category: "trades",
      city: "Boulder",
      state: "CO",
      tagline: "Reliable service",
      description: "Trusted local trades.",
      phone: "(555) 000-0001",
      services: ["plumbing"],
      hours: { weekday: "Mon-Fri 7am-5pm", weekend: "Sat-Sun 8am-2pm" },
      stage: "discovered",
      recommendedTier: "not-a-real-tier",
    });
  });

  const rows: LeadRow[] = await t.query(api.leads.list, { apiSecret: TEST_API_SECRET });
  const legacy = rows.find((r) => r.slug === "legacy-lead");
  expect(legacy?.category).toBe("generic");
  expect((legacy as unknown as { recommendedTier: string }).recommendedTier).toBe("growth");

  // Unrecognized recommendedTier falls back to the *category*-derived default
  // (trades -> starter), the same rule mapSqliteRowToLead applies.
  const legacyTrades = rows.find((r) => r.slug === "legacy-trades-lead");
  expect((legacyTrades as unknown as { recommendedTier: string }).recommendedTier).toBe(
    "starter",
  );

  const bySlug = await t.query(api.leads.getBySlug, {
    slug: "legacy-lead",
    apiSecret: TEST_API_SECRET,
  });
  expect((bySlug as unknown as { category: string } | null)?.category).toBe("generic");
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

test("updateStage returns false and skips the write when the fresh row already went paid/live and the new stage would revert it (update-lead-stage-action-paid-live-revert-guard)", async () => {
  // Reproduces updateLeadStageAction's TOCTOU window: the operator's
  // dashboard dropdown snapshot showed an earlier stage, but a concurrent
  // Stripe checkout (updateStage here stands in for recordLeadPayment)
  // completed in between — the stale dropdown write must not revert that.
  const t = convexTest(schema, modules);
  await t.mutation(
    api.leads.upsertLead,
    upsertArgs({ slug: "race-cafe", stage: "outreach_sent" }),
  );
  await t.mutation(api.leads.updateStage, {
    slug: "race-cafe",
    stage: "paid",
    apiSecret: TEST_API_SECRET,
  });

  await expect(
    t.mutation(api.leads.updateStage, {
      slug: "race-cafe",
      stage: "outreach_sent",
      apiSecret: TEST_API_SECRET,
    }),
  ).resolves.toBe(false);
  const row: LeadRow | null = await t.query(api.leads.getBySlug, {
    slug: "race-cafe",
    apiSecret: TEST_API_SECRET,
  });
  expect(row?.stage).toBe("paid");
});

test("updateStage still allows the normal paid -> live transition (Mark live) and a same-stage reconfirm from a fresh live/paid row", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(
    api.leads.upsertLead,
    upsertArgs({ slug: "live-cafe", stage: "outreach_sent" }),
  );
  await t.mutation(api.leads.updateStage, {
    slug: "live-cafe",
    stage: "paid",
    apiSecret: TEST_API_SECRET,
  });

  await expect(
    t.mutation(api.leads.updateStage, {
      slug: "live-cafe",
      stage: "live",
      apiSecret: TEST_API_SECRET,
    }),
  ).resolves.toBe(true);
  const liveRow: LeadRow | null = await t.query(api.leads.getBySlug, {
    slug: "live-cafe",
    apiSecret: TEST_API_SECRET,
  });
  expect(liveRow?.stage).toBe("live");

  await expect(
    t.mutation(api.leads.updateStage, {
      slug: "live-cafe",
      stage: "paid",
      apiSecret: TEST_API_SECRET,
    }),
  ).resolves.toBe(true);
  const revertedRow: LeadRow | null = await t.query(api.leads.getBySlug, {
    slug: "live-cafe",
    apiSecret: TEST_API_SECRET,
  });
  expect(revertedRow?.stage).toBe("paid");
});

test("upsertLead inserts a new lead and returns true, then returns false without patching on a second call for the same slug (lead-upsert-create-only-race-guard)", async () => {
  // Reproduces importLeadsCsvAction's TOCTOU window: the action's one-time
  // existingSlugs snapshot (read once before its sequential per-row upsert
  // loop) can go stale mid-loop — a concurrent create/payment/import for the
  // same slug must not have its stage/outreach/notes/snooze silently
  // clobbered back to CSV/create-path defaults by a second upsertLead call.
  const t = convexTest(schema, modules);
  const first = await t.mutation(
    api.leads.upsertLead,
    upsertArgs({ slug: "demo-cafe", businessName: "Demo Cafe", stage: "paid" }),
  );
  expect(first).toBe(true);

  const second = await t.mutation(
    api.leads.upsertLead,
    upsertArgs({ slug: "demo-cafe", businessName: "Demo Cafe Updated", stage: "discovered" }),
  );
  expect(second).toBe(false);

  const rows: LeadRow[] = await t.query(api.leads.list, { apiSecret: TEST_API_SECRET });
  expect(rows).toHaveLength(1);
  expect(rows[0].businessName).toBe("Demo Cafe");
  expect(rows[0].stage).toBe("paid");
});

test("categoryValidator accepts the retail category end to end (retail-category-landing-page)", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(
    api.leads.upsertLead,
    upsertArgs({ slug: "corner-mercantile", businessName: "Corner Mercantile", category: "retail" }),
  );

  const bySlug: LeadRow | null = await t.query(api.leads.getBySlug, {
    slug: "corner-mercantile",
    apiSecret: TEST_API_SECRET,
  });
  expect(bySlug?.category).toBe("retail");
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

test("markLeadPaid persists acquisitionSource onto the new order, and leaves it undefined when omitted", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(api.leads.markLeadPaid, {
    slug: "with-source",
    stripeSessionId: "cs_test_source_1",
    customerEmail: "buyer@example.com",
    tier: "starter",
    commerceAddon: false,
    amountTotal: 500,
    acquisitionSource: "cat-restaurant",
    apiSecret: TEST_API_SECRET,
  });
  await t.mutation(api.leads.markLeadPaid, {
    slug: "no-source",
    stripeSessionId: "cs_test_source_2",
    customerEmail: "buyer2@example.com",
    tier: "starter",
    commerceAddon: false,
    amountTotal: 500,
    apiSecret: TEST_API_SECRET,
  });

  const orders: Array<{ stripeSessionId: string; acquisitionSource?: string }> = await t.query(
    api.orders.list,
    { apiSecret: TEST_API_SECRET },
  );
  const withSource = orders.find((o) => o.stripeSessionId === "cs_test_source_1");
  const noSource = orders.find((o) => o.stripeSessionId === "cs_test_source_2");
  expect(withSource?.acquisitionSource).toBe("cat-restaurant");
  expect(noSource?.acquisitionSource).toBeUndefined();
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

test("markLeadPaid never regresses an already-live lead's stage back to paid, but still records the new order", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(api.leads.upsertLead, upsertArgs({ slug: "live-cafe", stage: "live" }));

  const result = await t.mutation(api.leads.markLeadPaid, {
    slug: "live-cafe",
    stripeSessionId: "cs_test_upsell",
    customerEmail: "owner@live-cafe.example",
    tier: "complete",
    commerceAddon: false,
    amountTotal: 19900,
    apiSecret: TEST_API_SECRET,
  });
  expect(result.alreadyRecorded).toBe(false);

  const leads: LeadRow[] = await t.query(api.leads.list, { apiSecret: TEST_API_SECRET });
  expect(leads).toHaveLength(1);
  expect(leads[0].stage).toBe("live");

  const orders = await t.query(api.orders.list, { apiSecret: TEST_API_SECRET });
  expect(orders).toHaveLength(1);
  expect(orders[0].stripeSessionId).toBe("cs_test_upsell");
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
  const applied = await t.mutation(api.leads.recordOutreach, {
    slug: "demo-cafe",
    outreachStep: 2,
    lastOutreachAt: "2026-02-01T00:00:00.000Z",
    apiSecret: TEST_API_SECRET,
  });
  expect(applied).toBe(true);
  const row: LeadRow | null = await t.query(api.leads.getBySlug, {
    slug: "demo-cafe",
    apiSecret: TEST_API_SECRET,
  });
  expect(row?.outreachStep).toBe(2);
  expect(row?.lastOutreachAt).toBe("2026-02-01T00:00:00.000Z");
});

test("recordOutreach returns false and skips the write when the fresh row already went paid/live/closed (sendfollowup-action-paid-live-closed-race-guard)", async () => {
  // Reproduces sendFollowUpAction's TOCTOU window: the operator's earlier
  // getLeadBySlug read saw an outreach-eligible lead, but a concurrent
  // Stripe checkout (updateStage here stands in for recordLeadPayment) or a
  // stage change to closed completed in between — the outreach write must
  // not still record a step or let the caller send a real Email 2/3.
  const t = convexTest(schema, modules);

  await t.mutation(
    api.leads.upsertLead,
    upsertArgs({ slug: "race-cafe", stage: "outreach_sent", outreachStep: 1 }),
  );
  await t.mutation(api.leads.updateStage, {
    slug: "race-cafe",
    stage: "paid",
    apiSecret: TEST_API_SECRET,
  });
  await expect(
    t.mutation(api.leads.recordOutreach, {
      slug: "race-cafe",
      outreachStep: 2,
      lastOutreachAt: "2026-02-01T00:00:00.000Z",
      apiSecret: TEST_API_SECRET,
    }),
  ).resolves.toBe(false);
  const paidRow: LeadRow | null = await t.query(api.leads.getBySlug, {
    slug: "race-cafe",
    apiSecret: TEST_API_SECRET,
  });
  expect(paidRow?.outreachStep).toBe(1);
  expect(paidRow?.lastOutreachAt).toBeUndefined();

  await t.mutation(
    api.leads.upsertLead,
    upsertArgs({ slug: "live-cafe", stage: "outreach_sent", outreachStep: 1 }),
  );
  await t.mutation(api.leads.updateStage, {
    slug: "live-cafe",
    stage: "live",
    apiSecret: TEST_API_SECRET,
  });
  await expect(
    t.mutation(api.leads.recordOutreach, {
      slug: "live-cafe",
      outreachStep: 2,
      lastOutreachAt: "2026-02-01T00:00:00.000Z",
      apiSecret: TEST_API_SECRET,
    }),
  ).resolves.toBe(false);

  await t.mutation(
    api.leads.upsertLead,
    upsertArgs({ slug: "closed-cafe", stage: "outreach_sent", outreachStep: 1 }),
  );
  await t.mutation(api.leads.updateStage, {
    slug: "closed-cafe",
    stage: "closed",
    apiSecret: TEST_API_SECRET,
  });
  await expect(
    t.mutation(api.leads.recordOutreach, {
      slug: "closed-cafe",
      outreachStep: 2,
      lastOutreachAt: "2026-02-01T00:00:00.000Z",
      apiSecret: TEST_API_SECRET,
    }),
  ).resolves.toBe(false);
});

test("recordOutreach returns false and skips the write when the lead's outreachStep already reached the requested step (outreach-step-duplicate-send-guard)", async () => {
  // Reproduces a double-click / two-tab race on sendFollowUpAction or
  // updateLeadStageAction("outreach_sent"): two concurrent calls both read
  // the same pre-write outreachStep and both compute the same target step.
  // Without this guard both would patch the row and both would proceed to
  // send the real Resend email — a genuine duplicate send to a live prospect.
  const t = convexTest(schema, modules);

  await t.mutation(
    api.leads.upsertLead,
    upsertArgs({ slug: "dup-send-cafe", stage: "outreach_sent", outreachStep: 1 }),
  );

  // The winner of the race already advanced the lead to step 2.
  await expect(
    t.mutation(api.leads.recordOutreach, {
      slug: "dup-send-cafe",
      outreachStep: 2,
      lastOutreachAt: "2026-02-01T00:00:00.000Z",
      apiSecret: TEST_API_SECRET,
    }),
  ).resolves.toBe(true);

  // The loser of the race replays the exact same request (same target step,
  // same stale outreachStep=1 snapshot) — must be skipped, not double-sent.
  await expect(
    t.mutation(api.leads.recordOutreach, {
      slug: "dup-send-cafe",
      outreachStep: 2,
      lastOutreachAt: "2026-02-01T00:05:00.000Z",
      apiSecret: TEST_API_SECRET,
    }),
  ).resolves.toBe(false);

  // A stale replay behind the current step (e.g. a delayed Email 1 request
  // arriving after Email 2 already recorded) must also be skipped.
  await expect(
    t.mutation(api.leads.recordOutreach, {
      slug: "dup-send-cafe",
      outreachStep: 1,
      lastOutreachAt: "2026-02-01T00:06:00.000Z",
      apiSecret: TEST_API_SECRET,
    }),
  ).resolves.toBe(false);

  const row: LeadRow | null = await t.query(api.leads.getBySlug, {
    slug: "dup-send-cafe",
    apiSecret: TEST_API_SECRET,
  });
  // Only the first (winning) write landed — timestamp not clobbered by
  // either later loser.
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

  // Empty string (or omitted) clears both. Convex patch() would also clear
  // via an explicit `undefined` — the handler coerces to "" instead for
  // parity with the SQLite twin's cleared value, not because patch ignores
  // undefined (see convex-patch-undefined-clear-semantics-correction).
  await t.mutation(api.leads.updateNotes, { slug: "demo-cafe", apiSecret: TEST_API_SECRET });
  await t.mutation(api.leads.updateSnooze, { slug: "demo-cafe", apiSecret: TEST_API_SECRET });
  row = await t.query(api.leads.getBySlug, { slug: "demo-cafe", apiSecret: TEST_API_SECRET });
  expect(row?.notes).toBe("");
  expect(row?.snoozedUntil).toBe("");
});

test("updateStripeConnectAccountId throws on an unknown slug and an empty string clears the field", async () => {
  const t = convexTest(schema, modules);
  await expect(
    t.mutation(api.leads.updateStripeConnectAccountId, {
      slug: "no-such-lead",
      stripeConnectAccountId: "acct_123",
      apiSecret: TEST_API_SECRET,
    }),
  ).rejects.toThrow("Lead with slug no-such-lead not found");

  await t.mutation(api.leads.upsertLead, upsertArgs({ slug: "demo-cafe" }));
  await t.mutation(api.leads.updateStripeConnectAccountId, {
    slug: "demo-cafe",
    stripeConnectAccountId: "acct_123",
    apiSecret: TEST_API_SECRET,
  });
  let row: LeadRow | null = await t.query(api.leads.getBySlug, {
    slug: "demo-cafe",
    apiSecret: TEST_API_SECRET,
  });
  expect(row?.stripeConnectAccountId).toBe("acct_123");

  // Empty string (or omitted) clears. Convex patch() would also clear via an
  // explicit `undefined` — the handler coerces to "" instead for parity with
  // the SQLite twin's cleared value, not because patch ignores undefined
  // (see convex-patch-undefined-clear-semantics-correction).
  await t.mutation(api.leads.updateStripeConnectAccountId, {
    slug: "demo-cafe",
    apiSecret: TEST_API_SECRET,
  });
  row = await t.query(api.leads.getBySlug, { slug: "demo-cafe", apiSecret: TEST_API_SECRET });
  expect(row?.stripeConnectAccountId).toBe("");
});

test("updateStripeConnectAccountId sets stripeConnectAccountCreatedAt once and never overwrites it on a later call", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(api.leads.upsertLead, upsertArgs({ slug: "demo-cafe" }));

  await t.mutation(api.leads.updateStripeConnectAccountId, {
    slug: "demo-cafe",
    stripeConnectAccountId: "acct_123",
    stripeConnectAccountCreatedAt: "2026-07-20T00:00:00.000Z",
    apiSecret: TEST_API_SECRET,
  });
  let row: LeadRow | null = await t.query(api.leads.getBySlug, {
    slug: "demo-cafe",
    apiSecret: TEST_API_SECRET,
  });
  expect(row?.stripeConnectAccountCreatedAt).toBe("2026-07-20T00:00:00.000Z");

  // A later call (e.g. an idempotent re-run after a prior persist failure)
  // passing a DIFFERENT createdAt must not overwrite the first-learned value.
  await t.mutation(api.leads.updateStripeConnectAccountId, {
    slug: "demo-cafe",
    stripeConnectAccountId: "acct_123",
    stripeConnectAccountCreatedAt: "2026-07-23T00:00:00.000Z",
    apiSecret: TEST_API_SECRET,
  });
  row = await t.query(api.leads.getBySlug, { slug: "demo-cafe", apiSecret: TEST_API_SECRET });
  expect(row?.stripeConnectAccountCreatedAt).toBe("2026-07-20T00:00:00.000Z");
});

test("updateStripeConnectStatus throws on an unknown slug and patches the cached onboarding status", async () => {
  const t = convexTest(schema, modules);
  await expect(
    t.mutation(api.leads.updateStripeConnectStatus, {
      slug: "no-such-lead",
      chargesEnabled: true,
      payoutsEnabled: true,
      detailsSubmitted: true,
      checkedAt: "2026-07-23T00:00:00.000Z",
      apiSecret: TEST_API_SECRET,
    }),
  ).rejects.toThrow("Lead with slug no-such-lead not found");

  await t.mutation(api.leads.upsertLead, upsertArgs({ slug: "demo-cafe" }));
  await t.mutation(api.leads.updateStripeConnectStatus, {
    slug: "demo-cafe",
    chargesEnabled: true,
    payoutsEnabled: false,
    detailsSubmitted: true,
    checkedAt: "2026-07-23T00:00:00.000Z",
    apiSecret: TEST_API_SECRET,
  });
  const row: LeadRow | null = await t.query(api.leads.getBySlug, {
    slug: "demo-cafe",
    apiSecret: TEST_API_SECRET,
  });
  expect(row?.stripeConnectChargesEnabled).toBe(true);
  expect(row?.stripeConnectPayoutsEnabled).toBe(false);
  expect(row?.stripeConnectDetailsSubmitted).toBe(true);
  expect(row?.stripeConnectStatusCheckedAt).toBe("2026-07-23T00:00:00.000Z");
});

test("updateBufferProfileIds throws on an unknown slug, patches the mapped profile ids, and an empty array clears them", async () => {
  const t = convexTest(schema, modules);
  await expect(
    t.mutation(api.leads.updateBufferProfileIds, {
      slug: "no-such-lead",
      bufferProfileIds: ["profile_1"],
      apiSecret: TEST_API_SECRET,
    }),
  ).rejects.toThrow("Lead with slug no-such-lead not found");

  await t.mutation(api.leads.upsertLead, upsertArgs({ slug: "demo-cafe" }));
  await t.mutation(api.leads.updateBufferProfileIds, {
    slug: "demo-cafe",
    bufferProfileIds: ["profile_1", "profile_2"],
    apiSecret: TEST_API_SECRET,
  });
  let row: LeadRow | null = await t.query(api.leads.getBySlug, {
    slug: "demo-cafe",
    apiSecret: TEST_API_SECRET,
  });
  expect(row?.bufferProfileIds).toEqual(["profile_1", "profile_2"]);

  // Full replacement, not a merge — the caller (dashboard action) computes
  // the complete desired set, so a shorter follow-up call must actually
  // shrink the stored list rather than union with the prior value.
  await t.mutation(api.leads.updateBufferProfileIds, {
    slug: "demo-cafe",
    bufferProfileIds: [],
    apiSecret: TEST_API_SECRET,
  });
  row = await t.query(api.leads.getBySlug, { slug: "demo-cafe", apiSecret: TEST_API_SECRET });
  expect(row?.bufferProfileIds).toEqual([]);
});

test("updateBufferProfileIds rejects a missing/wrong apiSecret without patching", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(api.leads.upsertLead, upsertArgs({ slug: "demo-cafe" }));
  await expect(
    t.mutation(api.leads.updateBufferProfileIds, {
      slug: "demo-cafe",
      bufferProfileIds: ["profile_1"],
      apiSecret: "wrong-secret",
    }),
  ).rejects.toThrow(/Unauthorized/);
  const row: LeadRow | null = await t.query(api.leads.getBySlug, {
    slug: "demo-cafe",
    apiSecret: TEST_API_SECRET,
  });
  expect(row?.bufferProfileIds).toBeUndefined();
});

test("updateBufferPostedVariantKeys throws on an unknown slug, patches the posted-variant set, and an empty array clears it", async () => {
  const t = convexTest(schema, modules);
  await expect(
    t.mutation(api.leads.updateBufferPostedVariantKeys, {
      slug: "no-such-lead",
      bufferPostedVariantKeys: ["2026-07:facebook_caption"],
      apiSecret: TEST_API_SECRET,
    }),
  ).rejects.toThrow("Lead with slug no-such-lead not found");

  await t.mutation(api.leads.upsertLead, upsertArgs({ slug: "demo-cafe" }));
  await t.mutation(api.leads.updateBufferPostedVariantKeys, {
    slug: "demo-cafe",
    bufferPostedVariantKeys: ["2026-07:facebook_caption", "2026-07:instagram_caption"],
    apiSecret: TEST_API_SECRET,
  });
  let row: LeadRow | null = await t.query(api.leads.getBySlug, {
    slug: "demo-cafe",
    apiSecret: TEST_API_SECRET,
  });
  expect(row?.bufferPostedVariantKeys).toEqual([
    "2026-07:facebook_caption",
    "2026-07:instagram_caption",
  ]);

  // Full replacement (the caller computes the pruned+merged set via
  // pruneBufferPostedVariantKeysForPack) — a shorter follow-up call must
  // shrink the stored set, e.g. once a new month's pack prunes stale keys.
  await t.mutation(api.leads.updateBufferPostedVariantKeys, {
    slug: "demo-cafe",
    bufferPostedVariantKeys: [],
    apiSecret: TEST_API_SECRET,
  });
  row = await t.query(api.leads.getBySlug, { slug: "demo-cafe", apiSecret: TEST_API_SECRET });
  expect(row?.bufferPostedVariantKeys).toEqual([]);
});

test("updateBufferPostedVariantKeys rejects a missing/wrong apiSecret without patching", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(api.leads.upsertLead, upsertArgs({ slug: "demo-cafe" }));
  await expect(
    t.mutation(api.leads.updateBufferPostedVariantKeys, {
      slug: "demo-cafe",
      bufferPostedVariantKeys: ["2026-07:facebook_caption"],
      apiSecret: "wrong-secret",
    }),
  ).rejects.toThrow(/Unauthorized/);
  const row: LeadRow | null = await t.query(api.leads.getBySlug, {
    slug: "demo-cafe",
    apiSecret: TEST_API_SECRET,
  });
  expect(row?.bufferPostedVariantKeys).toBeUndefined();
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
