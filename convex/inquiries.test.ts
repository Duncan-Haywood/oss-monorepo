import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

interface InquiryRow {
  id: string;
  leadSlug: string;
  businessName: string;
  message: string;
  status: string;
  source?: string;
  operatorReply?: string;
  repliedAt?: string;
  createdAt: string;
  updatedAt: string;
}

function createArgs(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    inquiryId: "inq_demo-cafe_1",
    leadSlug: "demo-cafe",
    businessName: "Demo Cafe",
    message: "Do you have gluten-free options?",
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

  const rows: InquiryRow[] = await t.query(api.inquiries.list, {});
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

  const rows: InquiryRow[] = await t.query(api.inquiries.list, {});
  expect(rows.map((r) => r.id)).toEqual(["inq_c", "inq_b", "inq_a"]);
});

test("listUnreplied returns only new/read inquiries, newest-first, excluding replied/archived", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(api.inquiries.create, createArgs({ inquiryId: "inq_new" }));
  await tick();
  await t.mutation(api.inquiries.create, createArgs({ inquiryId: "inq_read" }));
  await t.mutation(api.inquiries.updateStatus, { inquiryId: "inq_read", status: "read" });
  await t.mutation(api.inquiries.create, createArgs({ inquiryId: "inq_replied" }));
  await t.mutation(api.inquiries.recordReply, { inquiryId: "inq_replied", operatorReply: "Yes!" });
  await t.mutation(api.inquiries.create, createArgs({ inquiryId: "inq_archived" }));
  await t.mutation(api.inquiries.updateStatus, { inquiryId: "inq_archived", status: "archived" });

  const rows: InquiryRow[] = await t.query(api.inquiries.listUnreplied, {});
  expect(rows.map((r) => r.id)).toEqual(["inq_read", "inq_new"]);
});

test("listBySlug filters by lead, sorts newest-first, and respects limit (matches SQLite ORDER BY createdAt DESC LIMIT ?)", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(api.inquiries.create, createArgs({ inquiryId: "inq_1", leadSlug: "demo-cafe" }));
  await tick();
  await t.mutation(api.inquiries.create, createArgs({ inquiryId: "inq_2", leadSlug: "demo-cafe" }));
  await t.mutation(api.inquiries.create, createArgs({ inquiryId: "inq_other", leadSlug: "other-lead" }));

  const rows: InquiryRow[] = await t.query(api.inquiries.listBySlug, { leadSlug: "demo-cafe" });
  expect(rows.map((r) => r.id)).toEqual(["inq_2", "inq_1"]);

  const limited: InquiryRow[] = await t.query(api.inquiries.listBySlug, { leadSlug: "demo-cafe", limit: 1 });
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

  const rows: InquiryRow[] = await t.query(api.inquiries.listCommerceCheckoutBySlug, { leadSlug: "demo-cafe" });
  expect(rows.map((r) => r.id)).toEqual(["inq_commerce_2", "inq_commerce_1"]);
});

test("getById returns null for an unknown id and the row for a known one", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(api.inquiries.create, createArgs());

  const missing = await t.query(api.inquiries.getById, { inquiryId: "no-such-inquiry" });
  expect(missing).toBeNull();

  const found: InquiryRow | null = await t.query(api.inquiries.getById, { inquiryId: "inq_demo-cafe_1" });
  expect(found?.id).toBe("inq_demo-cafe_1");
});

test("updateStatus returns null on an unknown id (never throws) and patches status on a known one", async () => {
  const t = convexTest(schema, modules);
  await expect(t.mutation(api.inquiries.updateStatus, { inquiryId: "no-such-inquiry", status: "read" })).resolves.toBeNull();

  await t.mutation(api.inquiries.create, createArgs());
  const updated: InquiryRow | null = await t.mutation(api.inquiries.updateStatus, {
    inquiryId: "inq_demo-cafe_1",
    status: "read",
  });
  expect(updated?.status).toBe("read");
});

test("recordReply returns null on an unknown id (never throws) and sets status=replied + repliedAt on a known one", async () => {
  const t = convexTest(schema, modules);
  await expect(
    t.mutation(api.inquiries.recordReply, { inquiryId: "no-such-inquiry", operatorReply: "Hi!" }),
  ).resolves.toBeNull();

  await t.mutation(api.inquiries.create, createArgs());
  const replied: InquiryRow | null = await t.mutation(api.inquiries.recordReply, {
    inquiryId: "inq_demo-cafe_1",
    operatorReply: "Yes, we do!",
  });
  expect(replied?.status).toBe("replied");
  expect(replied?.operatorReply).toBe("Yes, we do!");
  expect(replied?.repliedAt).toBeTruthy();
});
