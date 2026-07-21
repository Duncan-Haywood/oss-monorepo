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

interface DeployHandoffRow {
  id: string;
  leadSlug: string;
  createdAt: string;
}

function upsertArgs(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    handoffId: "handoff_1",
    leadSlug: "demo-cafe",
    businessName: "Demo Cafe",
    tier: "starter",
    commerceAddon: false,
    stripeSessionId: "cs_1",
    customerEmail: "owner@demo-cafe.example",
    previewUrl: "https://example.com/preview/demo-cafe",
    suggestedHost: "demo-cafe.example.com",
    customDomain: undefined,
    contactFormUrl: "https://example.com/api/contact/demo-cafe",
    dnsInstructions: [],
    status: "awaiting_dns",
    vercelDomainStatus: undefined,
    vercelProjectId: undefined,
    notes: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    apiSecret: TEST_API_SECRET,
    ...overrides,
  };
}

test("upsert inserts a new handoff, then replaces (keeping handoffId + createdAt) on a second call for the same leadSlug", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(api.deployHandoffs.upsert, upsertArgs());
  await t.mutation(
    api.deployHandoffs.upsert,
    upsertArgs({
      handoffId: "handoff_should_be_ignored",
      businessName: "Demo Cafe Renamed",
      status: "pending",
      updatedAt: "2026-01-02T00:00:00.000Z",
    }),
  );

  const rows = await t.query(api.deployHandoffs.list, { apiSecret: TEST_API_SECRET });
  expect(rows).toHaveLength(1);
  expect(rows[0].id).toBe("handoff_1");
  expect(rows[0].createdAt).toBe("2026-01-01T00:00:00.000Z");
  expect(rows[0].businessName).toBe("Demo Cafe Renamed");
  expect(rows[0].status).toBe("pending");
});

test("upsert replace clears an omitted optional field (matches SQLite NULL overwrite)", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(
    api.deployHandoffs.upsert,
    upsertArgs({ customDomain: "client.example.com", vercelProjectId: "prj_1" }),
  );
  await t.mutation(
    api.deployHandoffs.upsert,
    upsertArgs({ customDomain: undefined, vercelProjectId: undefined, updatedAt: "2026-01-02T00:00:00.000Z" }),
  );

  const found = await t.query(api.deployHandoffs.getByLeadSlug, {
    leadSlug: "demo-cafe",
    apiSecret: TEST_API_SECRET,
  });
  expect(found?.customDomain).toBeUndefined();
  expect(found?.vercelProjectId).toBeUndefined();
});

test("upsert never persists apiSecret onto the row", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(api.deployHandoffs.upsert, upsertArgs());

  const row = await t.run(async (ctx) =>
    ctx.db
      .query("deployHandoffs")
      .withIndex("by_leadSlug", (q) => q.eq("leadSlug", "demo-cafe"))
      .unique(),
  );
  expect(row).not.toBeNull();
  expect(row).not.toHaveProperty("apiSecret");
});

test("upsert rejects a missing/wrong apiSecret and never creates a row for the attempted lead", async () => {
  const t = convexTest(schema, modules);
  await expect(
    t.mutation(api.deployHandoffs.upsert, upsertArgs({ apiSecret: "wrong-secret" })),
  ).rejects.toThrow(/Unauthorized/);

  const row = await t.run(async (ctx) =>
    ctx.db
      .query("deployHandoffs")
      .withIndex("by_leadSlug", (q) => q.eq("leadSlug", "demo-cafe"))
      .unique(),
  );
  expect(row).toBeNull();
});

test("upsert and list reject any caller when CONVEX_API_SECRET is unset, even a plausible-looking guess", async () => {
  delete process.env.CONVEX_API_SECRET;
  const t = convexTest(schema, modules);
  await expect(t.mutation(api.deployHandoffs.upsert, upsertArgs())).rejects.toThrow(/Unauthorized/);
  await expect(
    t.query(api.deployHandoffs.list, { apiSecret: TEST_API_SECRET }),
  ).rejects.toThrow(/Unauthorized/);
});

test("getByLeadSlug returns null for an unknown lead, and the stored handoff otherwise", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(api.deployHandoffs.upsert, upsertArgs());

  await expect(
    t.query(api.deployHandoffs.getByLeadSlug, { leadSlug: "no-such-lead", apiSecret: TEST_API_SECRET }),
  ).resolves.toBeNull();
  const found = await t.query(api.deployHandoffs.getByLeadSlug, {
    leadSlug: "demo-cafe",
    apiSecret: TEST_API_SECRET,
  });
  expect(found?.leadSlug).toBe("demo-cafe");
});

test("list keeps one row per lead and sorts newest-createdAt-first", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(api.deployHandoffs.upsert, upsertArgs({ leadSlug: "lead-a", handoffId: "h-a", createdAt: "2026-01-01T00:00:00.000Z" }));
  await t.mutation(api.deployHandoffs.upsert, upsertArgs({ leadSlug: "lead-b", handoffId: "h-b", createdAt: "2026-01-03T00:00:00.000Z" }));
  await t.mutation(api.deployHandoffs.upsert, upsertArgs({ leadSlug: "lead-c", handoffId: "h-c", createdAt: "2026-01-02T00:00:00.000Z" }));

  const rows: DeployHandoffRow[] = await t.query(api.deployHandoffs.list, { apiSecret: TEST_API_SECRET });
  expect(rows.map((r) => r.leadSlug)).toEqual(["lead-b", "lead-c", "lead-a"]);
});

test("getByCustomDomain resolves a lead by its stored custom domain, ignores empty string, and misses unknown hosts", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(api.deployHandoffs.upsert, upsertArgs({ customDomain: "client.example.com" }));
  await t.mutation(
    api.deployHandoffs.upsert,
    upsertArgs({ leadSlug: "lead-no-domain", handoffId: "h-no-domain", customDomain: undefined }),
  );

  await expect(
    t.query(api.deployHandoffs.getByCustomDomain, {
      customDomain: "client.example.com",
      apiSecret: TEST_API_SECRET,
    }),
  ).resolves.toEqual({ leadSlug: "demo-cafe" });
  await expect(
    t.query(api.deployHandoffs.getByCustomDomain, { customDomain: "", apiSecret: TEST_API_SECRET }),
  ).resolves.toBeNull();
  await expect(
    t.query(api.deployHandoffs.getByCustomDomain, {
      customDomain: "unrelated.example.com",
      apiSecret: TEST_API_SECRET,
    }),
  ).resolves.toBeNull();
});

test("updateStatus never downgrades an already-progressed status (live survives a stale awaiting_dns marker write)", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(api.deployHandoffs.upsert, upsertArgs({ status: "live" }));

  const result = await t.mutation(api.deployHandoffs.updateStatus, {
    leadSlug: "demo-cafe",
    status: "awaiting_dns",
    extraNotes: ["DNS handoff email sent"],
    updatedAt: "2026-01-02T00:00:00.000Z",
    apiSecret: TEST_API_SECRET,
  });

  expect(result?.status).toBe("live");
  expect(result?.notes).toEqual(["DNS handoff email sent"]);
});

test("updateStatus advances a lower-ranked status forward (Mark live)", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(api.deployHandoffs.upsert, upsertArgs({ status: "provisioned" }));

  const result = await t.mutation(api.deployHandoffs.updateStatus, {
    leadSlug: "demo-cafe",
    status: "live",
    extraNotes: [],
    updatedAt: "2026-01-02T00:00:00.000Z",
    apiSecret: TEST_API_SECRET,
  });

  expect(result?.status).toBe("live");
});

test("updateStatus returns null for an unknown lead", async () => {
  const t = convexTest(schema, modules);
  await expect(
    t.mutation(api.deployHandoffs.updateStatus, {
      leadSlug: "no-such-lead",
      status: "live",
      extraNotes: [],
      updatedAt: "2026-01-02T00:00:00.000Z",
      apiSecret: TEST_API_SECRET,
    }),
  ).resolves.toBeNull();
});

test("updateStatus rejects a missing/wrong apiSecret and leaves the status unchanged", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(api.deployHandoffs.upsert, upsertArgs({ status: "awaiting_dns" }));

  await expect(
    t.mutation(api.deployHandoffs.updateStatus, {
      leadSlug: "demo-cafe",
      status: "live",
      extraNotes: [],
      updatedAt: "2026-01-02T00:00:00.000Z",
      apiSecret: "wrong-secret",
    }),
  ).rejects.toThrow(/Unauthorized/);

  const found = await t.query(api.deployHandoffs.getByLeadSlug, {
    leadSlug: "demo-cafe",
    apiSecret: TEST_API_SECRET,
  });
  expect(found?.status).toBe("awaiting_dns");
});

test("updateVercelProject sets a dedicated project id, clears it on an empty/whitespace string, and returns null for an unknown lead", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(api.deployHandoffs.upsert, upsertArgs());

  const set = await t.mutation(api.deployHandoffs.updateVercelProject, {
    leadSlug: "demo-cafe",
    vercelProjectId: "prj_123",
    updatedAt: "2026-01-02T00:00:00.000Z",
    apiSecret: TEST_API_SECRET,
  });
  expect(set?.vercelProjectId).toBe("prj_123");

  const cleared = await t.mutation(api.deployHandoffs.updateVercelProject, {
    leadSlug: "demo-cafe",
    vercelProjectId: "   ",
    updatedAt: "2026-01-03T00:00:00.000Z",
    apiSecret: TEST_API_SECRET,
  });
  expect(cleared?.vercelProjectId).toBeUndefined();

  await expect(
    t.mutation(api.deployHandoffs.updateVercelProject, {
      leadSlug: "no-such-lead",
      vercelProjectId: "prj_x",
      updatedAt: "2026-01-02T00:00:00.000Z",
      apiSecret: TEST_API_SECRET,
    }),
  ).resolves.toBeNull();
});

test("updateVercelProject rejects a missing/wrong apiSecret and leaves the project unchanged", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(api.deployHandoffs.upsert, upsertArgs({ vercelProjectId: "prj_original" }));

  await expect(
    t.mutation(api.deployHandoffs.updateVercelProject, {
      leadSlug: "demo-cafe",
      vercelProjectId: "prj_attacker",
      updatedAt: "2026-01-02T00:00:00.000Z",
      apiSecret: "wrong-secret",
    }),
  ).rejects.toThrow(/Unauthorized/);

  const found = await t.query(api.deployHandoffs.getByLeadSlug, {
    leadSlug: "demo-cafe",
    apiSecret: TEST_API_SECRET,
  });
  expect(found?.vercelProjectId).toBe("prj_original");
});

test("updateCustomDomain normalizes a pasted URL down to a bare lowercase hostname, clears on empty string, and returns null for an unknown lead", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(api.deployHandoffs.upsert, upsertArgs());

  const set = await t.mutation(api.deployHandoffs.updateCustomDomain, {
    leadSlug: "demo-cafe",
    customDomain: "HTTPS://Client.Example.com/some/path.",
    updatedAt: "2026-01-02T00:00:00.000Z",
    apiSecret: TEST_API_SECRET,
  });
  expect(set?.customDomain).toBe("client.example.com");

  const cleared = await t.mutation(api.deployHandoffs.updateCustomDomain, {
    leadSlug: "demo-cafe",
    customDomain: "",
    updatedAt: "2026-01-03T00:00:00.000Z",
    apiSecret: TEST_API_SECRET,
  });
  expect(cleared?.customDomain).toBeUndefined();

  await expect(
    t.mutation(api.deployHandoffs.updateCustomDomain, {
      leadSlug: "no-such-lead",
      customDomain: "client.example.com",
      updatedAt: "2026-01-02T00:00:00.000Z",
      apiSecret: TEST_API_SECRET,
    }),
  ).resolves.toBeNull();
});

test("updateCustomDomain rejects a missing/wrong apiSecret and leaves the domain unchanged", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(api.deployHandoffs.upsert, upsertArgs({ customDomain: "original.example.com" }));

  await expect(
    t.mutation(api.deployHandoffs.updateCustomDomain, {
      leadSlug: "demo-cafe",
      customDomain: "attacker.example.com",
      updatedAt: "2026-01-02T00:00:00.000Z",
      apiSecret: "wrong-secret",
    }),
  ).rejects.toThrow(/Unauthorized/);

  const found = await t.query(api.deployHandoffs.getByLeadSlug, {
    leadSlug: "demo-cafe",
    apiSecret: TEST_API_SECRET,
  });
  expect(found?.customDomain).toBe("original.example.com");
});

// custom-domain-assign-race-guard: the caller-side getLeadSlugByCustomDomain
// precheck (assignCustomDomainAction) cannot by itself stop two concurrent
// Save-domain requests for two different leads from both passing before
// either write lands — the mutation must re-check atomically, right before
// its own persist, and reject the second writer rather than letting two
// leads end up sharing one Host→preview domain.
test("updateCustomDomain rejects when a different lead already owns the exact host, and leaves that lead's domain unchanged", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(api.deployHandoffs.upsert, upsertArgs({ customDomain: "client.example.com" }));
  await t.mutation(
    api.deployHandoffs.upsert,
    upsertArgs({ leadSlug: "other-lead", handoffId: "handoff_2", customDomain: undefined }),
  );

  await expect(
    t.mutation(api.deployHandoffs.updateCustomDomain, {
      leadSlug: "other-lead",
      customDomain: "client.example.com",
      updatedAt: "2026-01-02T00:00:00.000Z",
      apiSecret: TEST_API_SECRET,
    }),
  ).resolves.toEqual({ conflict: true, ownerSlug: "demo-cafe" });

  const otherLead = await t.query(api.deployHandoffs.getByLeadSlug, {
    leadSlug: "other-lead",
    apiSecret: TEST_API_SECRET,
  });
  expect(otherLead?.customDomain).toBeUndefined();
});

test("updateCustomDomain rejects the www twin of a domain another lead already owns", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(api.deployHandoffs.upsert, upsertArgs({ customDomain: "client.example.com" }));
  await t.mutation(
    api.deployHandoffs.upsert,
    upsertArgs({ leadSlug: "other-lead", handoffId: "handoff_2", customDomain: undefined }),
  );

  await expect(
    t.mutation(api.deployHandoffs.updateCustomDomain, {
      leadSlug: "other-lead",
      customDomain: "www.client.example.com",
      updatedAt: "2026-01-02T00:00:00.000Z",
      apiSecret: TEST_API_SECRET,
    }),
  ).resolves.toEqual({ conflict: true, ownerSlug: "demo-cafe" });
});

test("updateCustomDomain allows the same lead to re-save its own already-owned domain (not a conflict with itself)", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(api.deployHandoffs.upsert, upsertArgs({ customDomain: "client.example.com" }));

  const result = await t.mutation(api.deployHandoffs.updateCustomDomain, {
    leadSlug: "demo-cafe",
    customDomain: "client.example.com",
    updatedAt: "2026-01-02T00:00:00.000Z",
    apiSecret: TEST_API_SECRET,
  });
  expect(result).toEqual(
    expect.objectContaining({ leadSlug: "demo-cafe", customDomain: "client.example.com" }),
  );
});
