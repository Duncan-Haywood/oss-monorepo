import { describe, expect, it } from "vitest";
import { markLeadPaid } from "./leads";

/**
 * Minimal in-memory mock of the slice of ctx.db that markLeadPaid touches —
 * withIndex().eq()/.unique(), patch(), insert(). No convex-test harness is
 * wired up in this repo, but mutationGeneric()'s returned object exposes the
 * raw handler as `_handler`, so we can invoke the real convex/leads.ts
 * mutation logic directly against this mock.
 */
type Doc = Record<string, unknown> & { _id: string };

function makeMockDb(initial: { leads?: Doc[] } = {}) {
  const tables: Record<string, Doc[]> = {
    leads: initial.leads ? [...initial.leads] : [],
    orders: [],
  };
  let nextId = 1;

  function queryResult(rows: Doc[]) {
    return {
      unique: async () => (rows.length > 0 ? rows[0] : null),
      collect: async () => rows,
    };
  }

  return {
    query(table: string) {
      const rows = tables[table] ?? [];
      return {
        withIndex(_indexName: string, cb: (q: unknown) => unknown) {
          let field: string | undefined;
          let value: unknown;
          const q = {
            eq(f: string, v: unknown) {
              field = f;
              value = v;
              return q;
            },
          };
          cb(q);
          const filtered =
            field === undefined ? rows : rows.filter((row) => row[field as string] === value);
          return queryResult(filtered);
        },
      };
    },
    async patch(id: string, fields: Record<string, unknown>) {
      for (const table of Object.values(tables)) {
        const row = table.find((r) => r._id === id);
        if (row) Object.assign(row, fields);
      }
    },
    async insert(table: string, doc: Record<string, unknown>) {
      const id = `${table}_${nextId++}`;
      const row: Doc = { _id: id, ...doc };
      (tables[table] ??= []).push(row);
      return id;
    },
    tables,
  };
}

function baseArgs(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    slug: "acme-bakery",
    stripeSessionId: "cs_test_1",
    customerEmail: "owner@acme-bakery.example",
    tier: "growth" as const,
    commerceAddon: false,
    amountTotal: 300,
    ...overrides,
  };
}

describe("markLeadPaid stage transition", () => {
  it("advances a pre-payment lead to stage 'paid'", async () => {
    const db = makeMockDb({
      leads: [{ _id: "lead_1", slug: "acme-bakery", stage: "discovery_call" }],
    });
    const ctx = { db } as never;

    // @ts-expect-error _handler is convex's internal escape hatch for tests.
    const result = await markLeadPaid._handler(ctx, baseArgs());

    expect(result).toEqual({ alreadyRecorded: false });
    const lead = db.tables.leads.find((l) => l.slug === "acme-bakery");
    expect(lead?.stage).toBe("paid");
  });

  it("does not regress an already-live lead back to 'paid' on a second (upsell) payment", async () => {
    const db = makeMockDb({
      leads: [{ _id: "lead_1", slug: "acme-bakery", stage: "live" }],
    });
    const ctx = { db } as never;

    // A Starter -> Growth upsell reuses the same slug but a brand-new Stripe
    // Checkout Session id, so the stripeSessionId idempotency check does not
    // short-circuit it.
    // @ts-expect-error _handler is convex's internal escape hatch for tests.
    const result = await markLeadPaid._handler(ctx, baseArgs({ stripeSessionId: "cs_test_upsell" }));

    expect(result).toEqual({ alreadyRecorded: false });
    const lead = db.tables.leads.find((l) => l.slug === "acme-bakery");
    expect(lead?.stage).toBe("live");
  });

  it("still no-ops a redelivered webhook for an already-recorded stripeSessionId", async () => {
    const db = makeMockDb({
      leads: [{ _id: "lead_1", slug: "acme-bakery", stage: "live" }],
    });
    db.tables.orders.push({
      _id: "order_1",
      leadSlug: "acme-bakery",
      stripeSessionId: "cs_test_1",
    });
    const ctx = { db } as never;

    // @ts-expect-error _handler is convex's internal escape hatch for tests.
    const result = await markLeadPaid._handler(ctx, baseArgs());

    expect(result).toEqual({ alreadyRecorded: true });
  });
});
