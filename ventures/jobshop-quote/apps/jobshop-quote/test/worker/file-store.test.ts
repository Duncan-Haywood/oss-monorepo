// Files without R2 (ports/file-store.ts): with no FILES bucket bound, drawings, logos and sent quote
// PDFs live in D1's file_blobs in 1 MiB chunks; with the bucket, new files go to R2 and files written
// to D1 before it was bound are still read.
import { env } from "cloudflare:workers";
import type { RfqDetailDto } from "@shared/api";
import { createApp } from "@worker/app";
import type { Env } from "@worker/env";
import { TEST_USER_HEADER } from "@worker/middleware/session";
import { D1_CHUNK_BYTES, D1FileBucket, withFileStore } from "@worker/ports/file-store";
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
    const streamed = new Uint8Array(await new Response(got?.body).arrayBuffer());
    expect(streamed).toEqual(big);

    // A smaller replacement leaves no stale tail chunks behind.
    await d1.put("t/big", bytesOf(10).buffer);
    expect(await chunks("t/big")).toBe(1);
    expect(new Uint8Array((await (await d1.get("t/big"))?.arrayBuffer()) ?? [])).toEqual(
      bytesOf(10),
    );

    await d1.put("t/empty", new Uint8Array(0));
    expect((await d1.get("t/empty"))?.size).toBe(0);

    await d1.delete(["t/big", "t/empty"]);
    expect(await d1.get("t/big")).toBeNull();
    expect(await d1.get("t/empty")).toBeNull();
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
    const files = withFileStore(env).FILES;
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
  it("takes an RFQ with a drawing and serves the same bytes back", async () => {
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

    const drawing = "PART BRK-2001\nMATERIAL 6061-T6\nQTY 25\n";
    const form = new FormData();
    form.set("bodyText", "Please quote 25 pcs BRK-2001, 6061-T6.");
    form.append("files", new File([drawing], "BRK-2001.txt", { type: "text/plain" }));
    const res = await call(t.path("/rfqs"), { method: "POST", body: form });
    expect(res.status, await res.clone().text()).toBe(201);
    const rfq = await res.json<RfqDetailDto>();
    const file = rfq.files[0];
    expect(file?.sizeBytes).toBe(drawing.length);

    const prefix = `orgs/${t.orgId}/rfqs/${rfq.id}/`;
    const stored = await env.DB.prepare(
      "SELECT count(*) AS n FROM file_blobs WHERE substr(key, 1, ?) = ?",
    )
      .bind(prefix.length, prefix)
      .first<{ n: number }>();
    expect(stored?.n).toBe(1);

    const dl = await call(t.path(`/rfqs/${rfq.id}/files/${file?.id}/download`));
    expect(dl.status).toBe(200);
    expect(await dl.text()).toBe(drawing);
  });
});
