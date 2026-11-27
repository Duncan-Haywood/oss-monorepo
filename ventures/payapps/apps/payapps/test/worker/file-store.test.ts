// Files in D1 while no R2 bucket is bound (ports/file-store.ts): chunking, the deployment-wide cap,
// listing, the R2-then-D1 fallback, and a pay-app attachment's whole life on a deploy without R2.
import { env } from "cloudflare:workers";
import type { PayAppDetailDto, ProjectDto } from "@shared/api/types";
import { D1_ORG_LIMIT_BYTES, FREE_PLAN, planFeatures } from "@shared/plans";
import { beforeEach, describe, expect, it } from "vitest";
import { createAppContext } from "../../src/worker/context";
import type { Env } from "../../src/worker/env";
import { AppError } from "../../src/worker/lib/errors";
import {
  D1_CHUNK_BYTES,
  D1FileBucket,
  storageLimitBytes,
  withFileStore,
} from "../../src/worker/ports/file-store";
import { attachmentStore } from "../../src/worker/services/billing";
import {
  addAttachment,
  deleteAttachment,
  getAttachmentFile,
  listAttachments,
  purgeFiles,
} from "../../src/worker/services/payapps/attachments";
import { call, setupTenant } from "./helpers";

const db = (env as unknown as { DB: D1Database }).DB;
const r2 = (env as unknown as { FILES: R2Bucket }).FILES;
const noR2 = () => ({ ...(env as unknown as Env), FILES: undefined }) as Env;

function bytes(n: number, seed = 7) {
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) out[i] = (i * 31 + seed) & 0xff;
  return out;
}

beforeEach(async () => {
  await db.prepare("DELETE FROM file_blobs").run();
});

describe("D1FileBucket", () => {
  it("round-trips a file across several chunks, with its type and metadata", async () => {
    const store = new D1FileBucket(db);
    const data = bytes(D1_CHUNK_BYTES * 2 + 123);
    await store.put("orgs/o1/a", data, {
      httpMetadata: { contentType: "application/pdf" },
      customMetadata: { orgId: "o1" },
    });
    const chunks = await db
      .prepare("SELECT count(*) AS n FROM file_blobs WHERE key = ?")
      .bind("orgs/o1/a")
      .first<{ n: number }>();
    expect(chunks?.n).toBe(3);
    const got = await store.get("orgs/o1/a");
    expect(got?.size).toBe(data.byteLength);
    expect(got?.httpMetadata.contentType).toBe("application/pdf");
    expect(got?.customMetadata).toEqual({ orgId: "o1" });
    expect(new Uint8Array((await got?.arrayBuffer()) as ArrayBuffer)).toEqual(data);
    // The body stream carries the same bytes as arrayBuffer().
    const viaBody = new Uint8Array(await new Response(got?.body).arrayBuffer());
    expect(viaBody).toEqual(data);
  });

  it("reads a stream, replaces a file whole and deletes one or many", async () => {
    const store = new D1FileBucket(db);
    await store.put("k", new Response(bytes(D1_CHUNK_BYTES + 5)).body);
    await store.put("k", "short");
    expect(new TextDecoder().decode(await (await store.get("k"))?.arrayBuffer())).toBe("short");
    await store.put("k2", "x");
    await store.delete(["k", "k2"]);
    expect(await store.get("k")).toBeNull();
    expect(await store.get("k2")).toBeNull();
    expect(await store.get("never")).toBeNull();
  });

  it("refuses a short read instead of returning part of a file", async () => {
    const store = new D1FileBucket(db);
    await store.put("k", bytes(D1_CHUNK_BYTES + 10));
    await db.prepare("DELETE FROM file_blobs WHERE key = 'k' AND chunk = 1").run();
    await expect(store.get("k")).rejects.toThrow(/of \d+ bytes/);
  });

  it("refuses a file that would take every company's files past the deployment cap", async () => {
    const store = new D1FileBucket(db, 100);
    await store.put("a", bytes(60));
    const err = await store.put("b", bytes(50)).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).status).toBe(507);
    expect(await store.get("b")).toBeNull();
    // Replacing a file counts its new size, not both.
    await store.put("a", bytes(90));
    expect(await store.totalBytes()).toBe(90);
  });

  it("lists by prefix in pages, treating % and _ in keys literally", async () => {
    const store = new D1FileBucket(db);
    for (const k of ["p/1", "p/2", "p/3", "p%/x", "q/1"]) await store.put(k, "x");
    const first = await store.list({ prefix: "p/", limit: 2 });
    expect(first.objects.map((o) => o.key)).toEqual(["p/1", "p/2"]);
    expect(first.truncated).toBe(true);
    const second = await store.list({ prefix: "p/", limit: 2, cursor: first.cursor });
    expect(second.objects.map((o) => o.key)).toEqual(["p/3"]);
    expect(second.truncated).toBe(false);
    expect((await store.list({ prefix: "p%" })).objects.map((o) => o.key)).toEqual(["p%/x"]);
  });
});

describe("withFileStore", () => {
  it("reads R2 first and D1 for older files, lists and deletes both", async () => {
    const wrapped = withFileStore(env as unknown as Env);
    expect(wrapped.FILES_R2).toBe(r2);
    // A file written while there was no bucket, then the bucket bound.
    await new D1FileBucket(db).put("orgs/fb/old", "from d1");
    await wrapped.FILES?.put("orgs/fb/new", "from r2");
    const read = async (k: string) =>
      new TextDecoder().decode(await (await wrapped.FILES?.get(k))?.arrayBuffer());
    expect(await read("orgs/fb/old")).toBe("from d1");
    expect(await read("orgs/fb/new")).toBe("from r2");

    const keys: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await (wrapped.FILES as R2Bucket).list({ prefix: "orgs/fb/", cursor });
      keys.push(...page.objects.map((o) => o.key));
      cursor = page.truncated ? page.cursor : undefined;
    } while (cursor);
    expect(keys.sort()).toEqual(["orgs/fb/new", "orgs/fb/old"]);

    await wrapped.FILES?.delete(keys);
    expect(await wrapped.FILES?.get("orgs/fb/old")).toBeNull();
    expect(await r2.get("orgs/fb/new")).toBeNull();
  });

  it("is D1 alone without the bucket, and wrapping twice changes nothing", () => {
    const wrapped = withFileStore(noR2());
    expect(wrapped.FILES).toBeInstanceOf(D1FileBucket);
    expect(wrapped.FILES_R2).toBeUndefined();
    expect(withFileStore(wrapped)).toBe(wrapped);
  });
});

describe("plans on a deployment without R2", () => {
  it("caps each company at the D1 limit and says so on the storage lines", () => {
    const d1Env = withFileStore(noR2());
    expect(attachmentStore(d1Env)).toBe("d1");
    expect(attachmentStore(withFileStore(env as unknown as Env))).toBe("r2");
    expect(storageLimitBytes(d1Env, FREE_PLAN)).toBe(D1_ORG_LIMIT_BYTES);
    expect(storageLimitBytes(d1Env, { attachmentStorageBytes: 10 })).toBe(10);
    expect(storageLimitBytes(withFileStore(env as unknown as Env), FREE_PLAN)).toBe(
      FREE_PLAN.attachmentStorageBytes,
    );
    expect(planFeatures(FREE_PLAN, "d1")).toContain(
      "250 MB of attached backup and photos (50 MB for now)",
    );
  });
});

describe("a pay-app attachment with no R2 bucket", () => {
  it("uploads, lists, downloads, deletes and purges through D1", async () => {
    const { orgId, userId: as } = await setupTenant("owner");
    const project = await call<ProjectDto>(`/api/orgs/${orgId}/projects`, {
      method: "POST",
      as,
      expect: 201,
      json: {
        name: "Elm St clinic",
        gcName: "Harbor Builders",
        originalContractSumCents: 1_000_000,
        retainagePctBps: 1000,
        storedRetainagePctBps: 1000,
      },
    });
    const base = `/api/orgs/${orgId}/projects/${project.id}`;
    await call(`${base}/sov-lines/bulk`, {
      method: "POST",
      as,
      expect: 201,
      json: { lines: [{ itemNumber: "1", description: "Work", originalCents: 1_000_000 }] },
    });
    const app = await call<PayAppDetailDto>(`${base}/pay-apps`, {
      method: "POST",
      as,
      expect: 201,
      json: { periodFrom: "2026-01-01", periodTo: "2026-01-31", applicationDate: "2026-01-31" },
    });

    const ctx = createAppContext(noR2());
    const pdf = bytes(D1_CHUNK_BYTES + 999);
    const added = await addAttachment(
      ctx,
      orgId,
      project.id,
      app.id,
      { file: new File([pdf], "invoice.pdf"), category: "backup" },
      as,
    );
    const listed = await listAttachments(ctx, orgId, project.id, app.id);
    expect(listed.enabled).toBe(true);
    expect(listed.storage.limitBytes).toBe(D1_ORG_LIMIT_BYTES);
    expect(listed.items.map((i) => i.id)).toEqual([added.id]);
    // Nothing reached R2.
    expect((await r2.list({ prefix: `orgs/${orgId}/` })).objects).toHaveLength(0);

    const { body } = await getAttachmentFile(ctx, orgId, project.id, app.id, added.id);
    expect(new Uint8Array(await new Response(body).arrayBuffer())).toEqual(pdf);

    await deleteAttachment(ctx, orgId, project.id, app.id, added.id);
    expect((await ctx.env.FILES?.list({ prefix: `orgs/${orgId}/` }))?.objects).toHaveLength(0);

    // purgeFiles walks D1 too (a deleted job's files).
    await ctx.env.FILES?.put(`orgs/${orgId}/projects/${project.id}/x`, "left over");
    await purgeFiles(ctx, `orgs/${orgId}/projects/${project.id}/`);
    expect(await ctx.env.FILES?.get(`orgs/${orgId}/projects/${project.id}/x`)).toBeNull();
  });
});
