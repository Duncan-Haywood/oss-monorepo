import { LEGAL_DOC_KEYS, POLICY_VERSION } from "@shared/legal";
import { describe, expect, it } from "vitest";
import { api } from "./helpers";

describe("GET /api/legal", () => {
  it("lists every document, public and cacheable", async () => {
    const res = await api("/api/legal");
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=300");
    const body = (await res.json()) as { items: { key: string; version: string; title: string }[] };
    expect(body.items.map((i) => i.key)).toEqual([...LEGAL_DOC_KEYS]);
    expect(body.items.every((i) => i.version === POLICY_VERSION && i.title)).toBe(true);
  });

  it.each(LEGAL_DOC_KEYS)("GET /api/legal/%s returns markdown", async (key) => {
    const res = await api(`/api/legal/${key}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=300");
    const doc = (await res.json()) as { key: string; markdown: string; updatedAt: string };
    expect(doc.key).toBe(key);
    expect(doc.markdown).toContain("Mary Stella Labs, LLC");
    expect(doc.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("404s unknown documents", async () => {
    const res = await api("/api/legal/cookies");
    expect(res.status).toBe(404);
  });
});
