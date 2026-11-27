// Evidence without R2 (ports/file-store.ts): with no FILES bucket bound, evidence lives in D1's
// file_blobs in 1 MiB chunks; with the bucket, new files go to R2 and files written to D1 before it
// was bound are still read. Ported from Job Shop Quote's test (PR #19749).
import { env } from "cloudflare:workers";
import { createApp } from "@worker/app";
import type { Env } from "@worker/env";
import { TEST_USER_HEADER } from "@worker/middleware/session";
import { D1_CHUNK_BYTES, D1FileBucket, fileStoreFor } from "@worker/ports/file-store";
import { describe, expect, it } from "vitest";
import { BASE, setupTenant } from "./helpers";

const bytesOf = (n: number) => {
  const b = new Uint8Array(n);
  for (let i = 0; i < n; i++) b[i] = (i * 31 + 7) % 251;
  return b;
};
const chunks = async (key: string) =>
  (
    await env.DB.prepare("SELECT count(*) AS n FROM file_blobs WHERE key = ?")
      .bind(key)
      .first<{ n: number }>()
  )?.n;

describe("D1 file store", () => {
  it("keeps a multi-chunk file byte for byte, replaces it whole and deletes it", async () => {
    const d1 = new D1FileBucket(env.DB);
    const big = bytesOf(D1_CHUNK_BYTES * 2 + 12_345);
    await d1.put("t/big", big, { httpMetadata: { contentType: "application/pdf" } });
    expect(await chunks("t/big")).toBe(3);

    const got = await d1.get("t/big");
    expect(got?.size).toBe(big.byteLength);
    expect(got?.httpMetadata.contentType).toBe("application/pdf");
    expect(new Uint8Array((await got?.arrayBuffer()) ?? new ArrayBuffer(0))).toEqual(big);
    expect(new Uint8Array(await new Response(got?.body).arrayBuffer())).toEqual(big);

    // A smaller replacement leaves no stale tail chunks behind.
    await d1.put("t/big", bytesOf(10).buffer);
    expect(await chunks("t/big")).toBe(1);

    await d1.delete(["t/big"]);
    expect(await d1.get("t/big")).toBeNull();
  });

  it("refuses a file whose chunks went missing instead of returning it short", async () => {
    const d1 = new D1FileBucket(env.DB);
    await d1.put("t/torn", bytesOf(D1_CHUNK_BYTES + 5));
    await env.DB.prepare("DELETE FROM file_blobs WHERE key = ? AND chunk = 1").bind("t/torn").run();
    await expect(d1.get("t/torn")).rejects.toThrow(/of 1048581 bytes/);
  });
});

describe("R2 with the D1 fallback", () => {
  it("writes to R2, still reads what D1 holds, and deletes from both", async () => {
    const files = fileStoreFor(env);
    await new D1FileBucket(env.DB).put("t/old", bytesOf(100));

    await files.put("t/new", bytesOf(50));
    expect(await env.FILES.get("t/new")).not.toBeNull();
    expect(await chunks("t/new")).toBe(0);

    const old = await files.get("t/old");
    expect(new Uint8Array((await old?.arrayBuffer()) ?? [])).toEqual(bytesOf(100));

    await files.delete(["t/old", "t/new"]);
    expect(await files.get("t/old")).toBeNull();
    expect(await env.FILES.get("t/new")).toBeNull();
  });
});

describe("the app with no R2 bucket bound", () => {
  it("stores evidence in D1, serves the same bytes back and deletes them", async () => {
    const noR2 = { ...env, FILES: undefined } as unknown as Env;
    const app = createApp();
    const t = await setupTenant();
    const call = async (path: string, init: RequestInit = {}) => {
      // Buffer the body so the request carries a Content-Length, as a browser's upload does.
      const draft = new Request(`${BASE}${path}`, init);
      const body = init.body ? await draft.arrayBuffer() : undefined;
      const headers = new Headers(draft.headers);
      headers.set(TEST_USER_HEADER, t.userId);
      headers.set("Origin", BASE);
      if (body) headers.set("Content-Length", String(body.byteLength));
      const req = new Request(`${BASE}${path}`, { method: draft.method, headers, body });
      return app.fetch(req, noR2, {
        waitUntil: () => {},
        passThroughOnException: () => {},
        props: {},
      } as unknown as ExecutionContext);
    };

    const health = await (await call("/api/health")).json<{ files: string }>();
    expect(health.files).toBe("d1");

    const text = "Access control policy v3";
    const fd = new FormData();
    fd.set("file", new File([text], "ac policy.pdf", { type: "application/pdf" }));
    fd.set("title", "AC policy");
    fd.set("noCui", "true");
    const res = await call(`/api/orgs/${t.orgId}/evidence`, { method: "POST", body: fd });
    expect(res.status, await res.clone().text()).toBe(201);
    const dto = await res.json<{ id: string }>();
    const key = `orgs/${t.orgId}/evidence/${dto.id}`;
    expect(await chunks(key)).toBe(1);
    expect(await env.FILES.get(key)).toBeNull();

    const dl = await call(`/api/orgs/${t.orgId}/evidence/${dto.id}/download`);
    expect(dl.status).toBe(200);
    expect(await dl.text()).toBe(text);

    const del = await call(`/api/orgs/${t.orgId}/evidence/${dto.id}`, { method: "DELETE" });
    expect(del.status).toBe(200);
    expect(await chunks(key)).toBe(0);
  });

  it("reports r2 when the bucket is bound", async () => {
    const res = await createApp().fetch(new Request(`${BASE}/api/health`), env, {
      waitUntil: () => {},
      passThroughOnException: () => {},
      props: {},
    } as unknown as ExecutionContext);
    expect((await res.json<{ files: string }>()).files).toBe("r2");
  });
});
