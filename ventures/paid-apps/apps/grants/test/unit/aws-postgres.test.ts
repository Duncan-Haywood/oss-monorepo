// The AWS runtime's Postgres adapters against a real Postgres 16 (docs/AWS.md, "Verify").
// Skipped unless GRANTS_PG_URL (a superuser URL; a scratch database is created and dropped) and
// PG_MODULE_DIR (a directory whose node_modules has `pg`, e.g. the starter's runtime/ after
// `npm ci`) are set; .github/workflows/grants-aws.yml sets both.

import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { and, eq, like, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runLoadScript } from "../../src/worker/aws/cutover-load";
import { toLoadScript, translateD1Dump } from "../../src/worker/aws/d1-dump";
import { createPgD1, type PgPool } from "../../src/worker/aws/pg-d1";
import { drainJobs, PgQueue } from "../../src/worker/aws/pg-queue";
import { PgVectorStore } from "../../src/worker/aws/pg-vector-store";
import { reembedMissingVectors } from "../../src/worker/aws/reembed";
import { createAppContext } from "../../src/worker/context";
import { createDb, type Db } from "../../src/worker/db/client";
import {
  documentChunks,
  documents,
  facts,
  member,
  organization,
  subscriptions,
  user,
} from "../../src/worker/db/schema";
import type { Env } from "../../src/worker/env";
import { PaddleBillingProvider } from "../../src/worker/ports/billing/paddle";
import { createPendingCheckout } from "../../src/worker/services/billing/checkout";
import { syncPlatformEntitlements } from "../../src/worker/services/billing/entitlement-sync";

const PG_URL = process.env.GRANTS_PG_URL;
const PG_DIR = process.env.PG_MODULE_DIR;
const STARTER_PLATFORM_SQL = process.env.STARTER_PLATFORM_SQL;
const root = join(import.meta.dirname, "..", "..");

interface PgModule {
  Pool: new (cfg: { connectionString: string; max?: number }) => PgPool & { end(): Promise<void> };
  Client: new (cfg: {
    connectionString: string;
  }) => {
    connect(): Promise<void>;
    query(text: string): Promise<{ rows: Record<string, unknown>[] }>;
    end(): Promise<void>;
  };
}

describe.skipIf(!PG_URL || !PG_DIR)("AWS runtime on Postgres", () => {
  const dbName = `grants_test_${process.pid}`;
  let pg: PgModule;
  let pool: PgPool & { end(): Promise<void> };
  let d1: D1Database;
  let db: Db;
  const ms = (iso: string) => new Date(iso);

  async function admin(text: string) {
    const c = new pg.Client({ connectionString: PG_URL as string });
    await c.connect();
    try {
      return await c.query(text);
    } finally {
      await c.end();
    }
  }

  beforeAll(async () => {
    pg = createRequire(join(PG_DIR as string, "package.json"))("pg") as PgModule;
    await admin(`DROP DATABASE IF EXISTS ${dbName}`);
    await admin(`CREATE DATABASE ${dbName}`);
    const url = new URL(PG_URL as string);
    url.pathname = `/${dbName}`;
    pool = new pg.Pool({ connectionString: url.toString(), max: 4 });
    for (const f of readdirSync(join(root, "migrations-pg")).sort()) {
      await pool.query({ text: readFileSync(join(root, "migrations-pg", f), "utf8") });
    }
    if (STARTER_PLATFORM_SQL)
      await pool.query({ text: readFileSync(STARTER_PLATFORM_SQL, "utf8") });
    d1 = createPgD1(pool);
    db = createDb(d1);
    for (const [id, name] of [
      ["org_a", "Alpha Org"],
      ["org_b", "Beta Org"],
    ] as const) {
      await db.insert(organization).values({ id, name, slug: id, createdAt: new Date() });
    }
    await db.insert(user).values({
      id: "usr_1",
      name: "Ana",
      email: "ana@example.org",
      emailVerified: true,
      createdAt: ms("2026-11-01T00:00:00Z"),
      updatedAt: ms("2026-11-01T00:00:00Z"),
    });
    await db.insert(member).values({
      id: "mem_1",
      organizationId: "org_a",
      userId: "usr_1",
      role: "owner",
      createdAt: new Date(),
    });
  }, 60_000);

  afterAll(async () => {
    await pool?.end();
    if (pg) await admin(`DROP DATABASE IF EXISTS ${dbName}`);
  });

  it("round-trips dates, booleans and numbers the way D1 does", async () => {
    const row = await db.select().from(user).where(eq(user.id, "usr_1")).get();
    expect(row?.createdAt).toEqual(ms("2026-11-01T00:00:00Z"));
    expect(row?.emailVerified).toBe(true);
    const n = await db.select({ n: sql<number>`count(*)` }).from(organization).get();
    expect(n?.n).toBe(2);
  });

  it("keeps both columns when a join selects two columns with the same name", async () => {
    const rows = await db
      .select({ memberId: member.id, orgId: organization.id, orgName: organization.name })
      .from(member)
      .innerJoin(organization, eq(member.organizationId, organization.id))
      .all();
    expect(rows).toEqual([{ memberId: "mem_1", orgId: "org_a", orgName: "Alpha Org" }]);
    const full = await db
      .select()
      .from(member)
      .innerJoin(organization, eq(member.organizationId, organization.id))
      .get();
    expect(full?.member.id).toBe("mem_1");
    expect(full?.organization.id).toBe("org_a");
  });

  it("filters every tenant query by org, matches LIKE case-insensitively, and reads json flags", async () => {
    for (const orgId of ["org_a", "org_b"]) {
      await db.insert(documents).values({
        id: `doc_${orgId}`,
        orgId,
        title: "Annual Report",
        kind: "annual_report",
        mimeType: "text/plain",
        sizeBytes: 10,
        sha256: "x",
        r2Key: `orgs/${orgId}/documents/doc_${orgId}`,
        safetyFlags: { injectionSuspected: orgId === "org_b" },
        createdAt: new Date(),
        updatedAt: new Date(),
      } as typeof documents.$inferInsert);
      await db.insert(facts).values({
        id: `fct_${orgId}`,
        orgId,
        category: "mission",
        statement: `We serve Gallup families (${orgId})`,
        sourceType: "user_entered",
        status: "confirmed",
        createdAt: new Date(),
        updatedAt: new Date(),
      } as typeof facts.$inferInsert);
    }
    const mine = await db
      .select({ id: facts.id })
      .from(facts)
      .where(and(eq(facts.orgId, "org_a"), like(facts.statement, "%gallup%")))
      .all();
    expect(mine).toEqual([{ id: "fct_org_a" }]);
    const flagged = await db
      .select({ id: documents.id })
      .from(documents)
      .where(sql`json_extract(${documents.safetyFlags}, '$.injectionSuspected') = 1`)
      .all();
    expect(flagged).toEqual([{ id: "doc_org_b" }]);
  });

  it("upserts, returns rows and runs batches in one transaction", async () => {
    const up = (status: "active" | "past_due") =>
      db
        .insert(subscriptions)
        .values({
          orgId: "org_a",
          planKey: "starter",
          status,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({ target: subscriptions.orgId, set: { status } })
        .returning({ status: subscriptions.status });
    expect(await up("active")).toEqual([{ status: "active" }]);
    expect(await up("past_due")).toEqual([{ status: "past_due" }]);
    await expect(
      db.batch([
        db.update(organization).set({ name: "Renamed" }).where(eq(organization.id, "org_a")),
        db
          .insert(organization)
          .values({ id: "org_a", name: "dup", slug: "dup", createdAt: new Date() }),
      ]),
    ).rejects.toThrow();
    const org = await db
      .select({ name: organization.name })
      .from(organization)
      .where(eq(organization.id, "org_a"))
      .get();
    expect(org?.name).toBe("Alpha Org");
    const health = await d1
      .prepare("select count(*) as n from sqlite_master")
      .first<{ n: number }>();
    expect(health?.n).toBeGreaterThan(50);
  });

  it("never returns another org's vectors", async () => {
    const store = new PgVectorStore(pool);
    await store.upsert("org_a", [
      { id: "chk_a", values: [1, 0], metadata: { documentId: "doc_a", kind: "x" } },
    ]);
    await store.upsert("org_b", [
      { id: "chk_b", values: [1, 0], metadata: { documentId: "doc_b", kind: "x" } },
    ]);
    const hits = await store.query("org_a", [1, 0], { topK: 10 });
    expect(hits.map((h) => h.id)).toEqual(["chk_a"]);
    await store.deleteByIds("org_a", ["chk_b"]);
    expect((await store.query("org_b", [1, 0], { topK: 10 })).map((h) => h.id)).toEqual(["chk_b"]);
  });

  it("re-embeds migrated chunks into their own org's namespace only, once", async () => {
    for (const orgId of ["org_a", "org_b"]) {
      await db.insert(documentChunks).values({
        id: `chk_m_${orgId}`,
        orgId,
        documentId: `doc_${orgId}`,
        ordinal: 0,
        heading: null,
        text: `migrated text ${orgId}`,
        tokenEstimate: 3,
        charStart: 0,
        charEnd: 10,
        createdAt: new Date(),
      } as typeof documentChunks.$inferInsert);
    }
    const store = new PgVectorStore(pool);
    const embedder = { dimensions: 2, embed: async (t: string[]) => t.map(() => [0, 1]) };
    expect(await reembedMissingVectors(pool, embedder, store)).toBe(2);
    expect(await reembedMissingVectors(pool, embedder, store)).toBe(0);
    const a = await store.query("org_a", [0, 1], { topK: 10 });
    expect(a.map((h) => h.id)).toContain("chk_m_org_a");
    expect(a.map((h) => h.id)).not.toContain("chk_m_org_b");
    expect(a.find((h) => h.id === "chk_m_org_a")?.metadata).toEqual({
      documentId: "doc_org_a",
      kind: "annual_report",
    });
  });

  it("queues jobs, retries failures and dead-letters after three retries", async () => {
    const q = new PgQueue<{ type: string }>(pool);
    await q.send({ type: "ok" });
    await q.send({ type: "fail" });
    let t = Date.now();
    const now = () => t;
    const seen: string[] = [];
    const consume = async (batch: {
      messages: {
        body: { type: string };
        ack(): void;
        retry(o?: { delaySeconds?: number }): void;
      }[];
    }) => {
      for (const m of batch.messages) {
        seen.push(m.body.type);
        if (m.body.type === "ok") m.ack();
        else m.retry({ delaySeconds: 0 });
      }
    };
    for (let i = 0; i < 5; i++) {
      await drainJobs(pool, consume, { now, budgetMs: 1 });
      t += 1000;
    }
    expect(seen.filter((s) => s === "ok")).toHaveLength(1);
    expect(seen.filter((s) => s === "fail")).toHaveLength(4);
    const left = await pool.query({ text: "select body, dead_at from aws_jobs" });
    expect(left.rows).toHaveLength(1);
    expect((left.rows[0] as { dead_at: unknown }).dead_at).not.toBeNull();
  });

  it("loads a D1 export into an empty database: forward references, escapes, newlines, exact counts", async () => {
    const loadDb = `${dbName}_load`;
    await admin(`DROP DATABASE IF EXISTS ${loadDb}`);
    await admin(`CREATE DATABASE ${loadDb}`);
    const url = new URL(PG_URL as string);
    url.pathname = `/${loadDb}`;
    const target = new pg.Pool({ connectionString: url.toString(), max: 2 });
    try {
      for (const f of readdirSync(join(root, "migrations-pg")).sort()) {
        await target.query({ text: readFileSync(join(root, "migrations-pg", f), "utf8") });
      }
      const dump = readFileSync(join(root, "test/fixtures/aws/d1-export.sql"), "utf8");
      const tables = (
        await target.query({
          text: "select table_name from information_schema.tables where table_schema='public'",
        })
      ).rows.map((r) => (r as { table_name: string }).table_name);
      const t = translateD1Dump(dump, tables);
      expect(t.unknownTables).toEqual([]);
      expect(t.counts).toEqual({ facts: 1, organization: 1 });
      // A script whose counts do not match fails and leaves nothing behind.
      const wrong = toLoadScript({ ...t, counts: { ...t.counts, facts: 99 } });
      await expect(runLoadScript(target, wrong)).rejects.toThrow(/row count mismatch in facts/);
      const tdb = createDb(createPgD1(target));
      expect(await tdb.select().from(facts).all()).toEqual([]);
      await runLoadScript(target, toLoadScript(t));
      const f = await tdb.select().from(facts).where(eq(facts.id, "fct_dump")).get();
      expect(f?.statement).toBe('It\'s "quoted"\nand multi-line');
      expect(f?.orgId).toBe("org_dump");
      expect(f?.createdAt).toEqual(new Date(1732492800000));
      const o = await tdb.select().from(organization).get();
      expect(o?.name).toBe("Dump; Org");
    } finally {
      await target.end();
      await admin(`DROP DATABASE IF EXISTS ${loadDb}`);
    }
  });

  it.skipIf(!STARTER_PLATFORM_SQL)(
    "applies Paddle entitlements from the payments sub-stack to the right org only",
    async () => {
      const env = {
        APP_ENV: "development",
        FAKE_EXTERNALS: "true",
        AUTH_SECRET: "test-secret-for-checkout-tokens-0123456789",
        BILLING_ENTITLEMENT_PRODUCT: "grants",
        DB: d1,
      } as unknown as Env;
      const billing = new PaddleBillingProvider({
        apiKey: "pdl_sdbx_test",
        webhookSecret: "",
        priceIds: { starter: "pri_starter" },
        entitlementProduct: "grants",
      });
      const ctx = createAppContext(env, { db, billing });
      const { token } = await createPendingCheckout(ctx, {
        orgId: "org_b",
        planKey: "starter",
        interval: "month",
        createdBy: null,
      });
      const insert = (userSub: string, sub: string, status: string, at: string) =>
        pool.query({
          text: `insert into platform.entitlements (product, user_sub, status, plan, subscription_id, customer_id, current_period_end, source_occurred_at)
               values ('grants', $1, $2, 'pri_starter', $3, 'ctm_1', '2026-12-25T00:00:00Z', $4)
               on conflict (product, user_sub) do update set status = excluded.status, source_occurred_at = excluded.source_occurred_at, updated_at = now()`,
          values: [userSub, status, sub, at],
        });
      await insert(token, "sub_1", "active", "2026-11-25T00:00:00Z");
      // A forged row naming an org directly (anyone can put any user_sub in a Paddle checkout).
      await insert("org_a", "sub_evil", "active", "2026-11-25T00:00:00Z");
      const r1 = await syncPlatformEntitlements(ctx);
      expect(r1.outcomes).toEqual({ applied: 1, duplicate: 0, ignored: 1 });
      const b = await db.select().from(subscriptions).where(eq(subscriptions.orgId, "org_b")).get();
      expect(b?.status).toBe("active");
      expect(b?.providerSubscriptionId).toBe("sub_1");
      const a = await db.select().from(subscriptions).where(eq(subscriptions.orgId, "org_a")).get();
      expect(a?.providerSubscriptionId ?? null).toBeNull();
      // Later state for the same subscription binds through the subscription, not the spent token.
      await insert(token, "sub_1", "past_due", "2026-11-26T00:00:00Z");
      const r2 = await syncPlatformEntitlements(ctx);
      expect(r2.outcomes.applied).toBe(1);
      expect(
        (await db.select().from(subscriptions).where(eq(subscriptions.orgId, "org_b")).get())
          ?.status,
      ).toBe("past_due");
      // Nothing new: nothing re-applied.
      expect((await syncPlatformEntitlements(ctx)).seen).toBe(0);
    },
  );
});
