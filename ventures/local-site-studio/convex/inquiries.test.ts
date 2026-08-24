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

interface InquiryRow {
  id: string;
  leadSlug: string;
  businessName: string;
  message: string;
  status: string;
  source?: string;
  operatorReply?: string;
  repliedAt?: string;
  replySentCount?: number;
  createdAt: string;
  updatedAt: string;
}

function createArgs(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    inquiryId: "inq_demo-cafe_1",
    leadSlug: "demo-cafe",
    businessName: "Demo Cafe",
    message: "Do you have gluten-free options?",
    apiSecret: TEST_API_SECRET,
    ...overrides,
  };
}

// create's createdAt is server-generated (Date.now(), no explicit arg like
// checkoutSessions.create) — a real millisecond tick between sequential
// inserts is required so ordering assertions on createdAt DESC are
// deterministic rather than tied and order-of-collect()-dependent.
function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 2));
}

test("create inserts status=new and returns the same shape stored", async () => {
  const t = convexTest(schema, modules);
  const created: InquiryRow = await t.mutation(api.inquiries.create, createArgs());
  expect(created.status).toBe("new");
  expect(created.id).toBe("inq_demo-cafe_1");

  const rows: InquiryRow[] = await t.query(api.inquiries.list, { apiSecret: TEST_API_SECRET });
  expect(rows).toHaveLength(1);
  expect(rows[0].id).toBe("inq_demo-cafe_1");
});

test("list returns inquiries newest-first (matches SQLite ORDER BY createdAt DESC)", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(api.inquiries.create, createArgs({ inquiryId: "inq_a" }));
  await tick();
  await t.mutation(api.inquiries.create, createArgs({ inquiryId: "inq_b" }));
  await tick();
  await t.mutation(api.inquiries.create, createArgs({ inquiryId: "inq_c" }));

  const rows: InquiryRow[] = await t.query(api.inquiries.list, { apiSecret: TEST_API_SECRET });
  expect(rows.map((r) => r.id)).toEqual(["inq_c", "inq_b", "inq_a"]);
});

test("listUnreplied returns only new/read inquiries, newest-first, excluding replied/archived", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(api.inquiries.create, createArgs({ inquiryId: "inq_new" }));
  await tick();
  await t.mutation(api.inquiries.create, createArgs({ inquiryId: "inq_read" }));
  await t.mutation(api.inquiries.updateStatus, { inquiryId: "inq_read", status: "read", apiSecret: TEST_API_SECRET });
  await t.mutation(api.inquiries.create, createArgs({ inquiryId: "inq_replied" }));
  await t.mutation(api.inquiries.recordReply, { inquiryId: "inq_replied", operatorReply: "Yes!", expectedReplySentCount: 0, apiSecret: TEST_API_SECRET });
  await t.mutation(api.inquiries.create, createArgs({ inquiryId: "inq_archived" }));
  await t.mutation(api.inquiries.updateStatus, { inquiryId: "inq_archived", status: "archived", apiSecret: TEST_API_SECRET });

  const rows: InquiryRow[] = await t.query(api.inquiries.listUnreplied, { apiSecret: TEST_API_SECRET });
  expect(rows.map((r) => r.id)).toEqual(["inq_read", "inq_new"]);
});

test("listBySlug filters by lead, sorts newest-first, and respects limit (matches SQLite ORDER BY createdAt DESC LIMIT ?)", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(api.inquiries.create, createArgs({ inquiryId: "inq_1", leadSlug: "demo-cafe" }));
  await tick();
  await t.mutation(api.inquiries.create, createArgs({ inquiryId: "inq_2", leadSlug: "demo-cafe" }));
  await t.mutation(api.inquiries.create, createArgs({ inquiryId: "inq_other", leadSlug: "other-lead" }));

  const rows: InquiryRow[] = await t.query(api.inquiries.listBySlug, {
    leadSlug: "demo-cafe",
    apiSecret: TEST_API_SECRET,
  });
  expect(rows.map((r) => r.id)).toEqual(["inq_2", "inq_1"]);

  const limited: InquiryRow[] = await t.query(api.inquiries.listBySlug, {
    leadSlug: "demo-cafe",
    limit: 1,
    apiSecret: TEST_API_SECRET,
  });
  expect(limited.map((r) => r.id)).toEqual(["inq_2"]);
});

test("listCommerceCheckoutBySlug returns only commerce_checkout-sourced inquiries for the lead, newest-first", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(
    api.inquiries.create,
    createArgs({ inquiryId: "inq_commerce_1", leadSlug: "demo-cafe", source: "commerce_checkout" }),
  );
  await tick();
  await t.mutation(
    api.inquiries.create,
    createArgs({ inquiryId: "inq_commerce_2", leadSlug: "demo-cafe", source: "commerce_checkout" }),
  );
  await t.mutation(api.inquiries.create, createArgs({ inquiryId: "inq_contact", leadSlug: "demo-cafe", source: "contact_form" }));
  await t.mutation(
    api.inquiries.create,
    createArgs({ inquiryId: "inq_other_lead", leadSlug: "other-lead", source: "commerce_checkout" }),
  );

  const rows: InquiryRow[] = await t.query(api.inquiries.listCommerceCheckoutBySlug, {
    leadSlug: "demo-cafe",
    apiSecret: TEST_API_SECRET,
  });
  expect(rows.map((r) => r.id)).toEqual(["inq_commerce_2", "inq_commerce_1"]);
});

test("getById returns null for an unknown id and the row for a known one", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(api.inquiries.create, createArgs());

  const missing = await t.query(api.inquiries.getById, {
    inquiryId: "no-such-inquiry",
    apiSecret: TEST_API_SECRET,
  });
  expect(missing).toBeNull();

  const found: InquiryRow | null = await t.query(api.inquiries.getById, {
    inquiryId: "inq_demo-cafe_1",
    apiSecret: TEST_API_SECRET,
  });
  expect(found?.id).toBe("inq_demo-cafe_1");
});

test("updateStatus returns null on an unknown id (never throws) and patches status on a known one", async () => {
  const t = convexTest(schema, modules);
  await expect(
    t.mutation(api.inquiries.updateStatus, {
      inquiryId: "no-such-inquiry",
      status: "read",
      apiSecret: TEST_API_SECRET,
    }),
  ).resolves.toBeNull();

  await t.mutation(api.inquiries.create, createArgs());
  const updated: InquiryRow | null = await t.mutation(api.inquiries.updateStatus, {
    inquiryId: "inq_demo-cafe_1",
    status: "read",
    apiSecret: TEST_API_SECRET,
  });
  expect(updated?.status).toBe("read");
});

test("recordReply returns null on an unknown id (never throws) and sets status=replied + repliedAt on a known one", async () => {
  const t = convexTest(schema, modules);
  await expect(
    t.mutation(api.inquiries.recordReply, {
      inquiryId: "no-such-inquiry",
      operatorReply: "Hi!",
      expectedReplySentCount: 0,
      apiSecret: TEST_API_SECRET,
    }),
  ).resolves.toBeNull();

  await t.mutation(api.inquiries.create, createArgs());
  const replied: InquiryRow | null = await t.mutation(api.inquiries.recordReply, {
    inquiryId: "inq_demo-cafe_1",
    operatorReply: "Yes, we do!",
    expectedReplySentCount: 0,
    apiSecret: TEST_API_SECRET,
  });
  expect(replied?.status).toBe("replied");
  expect(replied?.operatorReply).toBe("Yes, we do!");
  expect(replied?.repliedAt).toBeTruthy();
  expect(replied?.replySentCount).toBe(1);
});

test("recordReply rejects (returns null, no patch) once the inquiry is archived — race guard against a stale action-level read", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(api.inquiries.create, createArgs());
  await t.mutation(api.inquiries.updateStatus, {
    inquiryId: "inq_demo-cafe_1",
    status: "archived",
    apiSecret: TEST_API_SECRET,
  });

  await expect(
    t.mutation(api.inquiries.recordReply, {
      inquiryId: "inq_demo-cafe_1",
      operatorReply: "Too late, archived first",
      expectedReplySentCount: 0,
      apiSecret: TEST_API_SECRET,
    }),
  ).resolves.toBeNull();

  const stillArchived: InquiryRow | null = await t.query(api.inquiries.getById, {
    inquiryId: "inq_demo-cafe_1",
    apiSecret: TEST_API_SECRET,
  });
  expect(stillArchived?.status).toBe("archived");
  expect(stillArchived?.operatorReply).toBeUndefined();
});

test("recordReply rejects a stale expectedReplySentCount (inquiry-reply-send-race-guard) but a later, deliberate follow-up with the fresh count still succeeds", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(api.inquiries.create, createArgs());

  const first: InquiryRow | null = await t.mutation(api.inquiries.recordReply, {
    inquiryId: "inq_demo-cafe_1",
    operatorReply: "First reply",
    expectedReplySentCount: 0,
    apiSecret: TEST_API_SECRET,
  });
  expect(first?.replySentCount).toBe(1);

  // A concurrent duplicate call captured the same stale expected count (0)
  // before the first call's patch landed.
  await expect(
    t.mutation(api.inquiries.recordReply, {
      inquiryId: "inq_demo-cafe_1",
      operatorReply: "Duplicate reply",
      expectedReplySentCount: 0,
      apiSecret: TEST_API_SECRET,
    }),
  ).resolves.toBeNull();

  const afterDuplicateAttempt: InquiryRow | null = await t.query(api.inquiries.getById, {
    inquiryId: "inq_demo-cafe_1",
    apiSecret: TEST_API_SECRET,
  });
  expect(afterDuplicateAttempt?.operatorReply).toBe("First reply");

  const followUp: InquiryRow | null = await t.mutation(api.inquiries.recordReply, {
    inquiryId: "inq_demo-cafe_1",
    operatorReply: "Follow-up reply",
    expectedReplySentCount: 1,
    apiSecret: TEST_API_SECRET,
  });
  expect(followUp?.status).toBe("replied");
  expect(followUp?.operatorReply).toBe("Follow-up reply");
  expect(followUp?.replySentCount).toBe(2);
});

test("every function rejects a missing/wrong apiSecret, even with CONVEX_API_SECRET configured", async () => {
  const t = convexTest(schema, modules);
  await expect(
    t.mutation(api.inquiries.create, { ...createArgs(), apiSecret: "wrong" }),
  ).rejects.toThrow(/Unauthorized/);
  await expect(t.query(api.inquiries.list, { apiSecret: "wrong" })).rejects.toThrow(/Unauthorized/);
  await expect(t.query(api.inquiries.listUnreplied, { apiSecret: "wrong" })).rejects.toThrow(/Unauthorized/);
  await expect(
    t.query(api.inquiries.listBySlug, { leadSlug: "demo-cafe", apiSecret: "wrong" }),
  ).rejects.toThrow(/Unauthorized/);
  await expect(
    t.query(api.inquiries.listCommerceCheckoutBySlug, { leadSlug: "demo-cafe", apiSecret: "wrong" }),
  ).rejects.toThrow(/Unauthorized/);
  await expect(
    t.query(api.inquiries.getById, { inquiryId: "inq_demo-cafe_1", apiSecret: "wrong" }),
  ).rejects.toThrow(/Unauthorized/);
  await expect(
    t.mutation(api.inquiries.updateStatus, { inquiryId: "inq_demo-cafe_1", status: "read", apiSecret: "wrong" }),
  ).rejects.toThrow(/Unauthorized/);
  await expect(
    t.mutation(api.inquiries.recordReply, { inquiryId: "inq_demo-cafe_1", operatorReply: "Hi!", expectedReplySentCount: 0, apiSecret: "wrong" }),
  ).rejects.toThrow(/Unauthorized/);
});
