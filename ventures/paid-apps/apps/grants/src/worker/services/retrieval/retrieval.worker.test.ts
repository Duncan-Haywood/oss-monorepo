// Integration tests for hybrid retrieval + POST /search in workerd (local D1, fake embedder,
// in-memory vector store).
import { env } from "cloudflare:workers";
import type { DocumentKind, PastOutcome } from "@shared/enums";
import { createAppContext } from "@worker/context";
import { documentChunks, documents } from "@worker/db/schema";
import { newId } from "@worker/lib/ids";
import { FakeEmbedder, InMemoryVectorStore } from "@worker/ports/fakes";
import type { VectorStore } from "@worker/ports/vector-store";
import { describe, expect, it } from "vitest";
import { api, setupTenant, testDb } from "../../../../test/worker/helpers";
import { formatChunksForPrompt, retrieveChunks, retrieveStyleExamples } from "./index";

interface SeedDoc {
  title: string;
  kind?: DocumentKind;
  pastOutcome?: PastOutcome | null;
  pastYear?: number;
  chunks: string[];
}

const embedder = new FakeEmbedder();

/** Inserts documents + chunks for an org and (optionally) indexes them in `vectors`. */
async function seed(orgId: string, docs: SeedDoc[], vectors?: VectorStore) {
  const db = testDb();
  const ids: { docId: string; chunkIds: string[] }[] = [];
  for (const d of docs) {
    const docId = newId("doc");
    await db.insert(documents).values({
      id: docId,
      orgId,
      title: d.title,
      kind: d.kind ?? "program_description",
      mimeType: "text/plain",
      sizeBytes: 100,
      sha256: docId,
      r2Key: `orgs/${orgId}/documents/${docId}/original`,
      status: "ready",
      pastOutcome: d.pastOutcome ?? null,
      pastYear: d.pastYear ?? null,
      chunkCount: d.chunks.length,
    });
    const chunkIds: string[] = [];
    let pos = 0;
    for (const [ordinal, text] of d.chunks.entries()) {
      const id = newId("chk");
      chunkIds.push(id);
      await db.insert(documentChunks).values({
        id,
        orgId,
        documentId: docId,
        ordinal,
        heading: null,
        text,
        tokenEstimate: Math.ceil(text.length / 4),
        charStart: pos,
        charEnd: pos + text.length,
      });
      pos += text.length;
    }
    if (vectors) {
      const vecs = await embedder.embed(d.chunks);
      await vectors.upsert(
        orgId,
        chunkIds.map((id, i) => ({
          id,
          values: vecs[i] ?? [],
          metadata: { documentId: docId, kind: d.kind ?? "program_description" },
        })),
      );
    }
    ids.push({ docId, chunkIds });
  }
  return ids;
}

const ctxWith = (vectors: VectorStore) => createAppContext(env, { vectors, embedder });

const SWIF_DOCS: SeedDoc[] = [
  {
    title: "Trades Program",
    chunks: [
      "Our workforce development program teaches carpentry, plumbing and electrical trades to Navajo youth in Gallup.",
      "Graduates earn construction certifications and many are hired by local contractors.",
    ],
  },
  {
    title: "Housing",
    chunks: ["We repair homes for elders across the Navajo Nation reservation."],
  },
];

describe("retrieveChunks", () => {
  it("returns hybrid results for the org", async () => {
    const { orgId } = await setupTenant();
    const vectors = new InMemoryVectorStore();
    await seed(orgId, SWIF_DOCS, vectors);
    const res = await retrieveChunks(ctxWith(vectors), orgId, "carpentry trades training");
    expect(res.length).toBeGreaterThan(0);
    expect(res[0]?.documentTitle).toBe("Trades Program");
    expect(res[0]?.text).toContain("carpentry");
    expect(res[0]?.score).toBeGreaterThan(0);
    expect(res[0]?.score).toBeLessThanOrEqual(1);
  });

  it("still returns results when the vector store is empty (keyword fallback)", async () => {
    const { orgId } = await setupTenant();
    await seed(orgId, SWIF_DOCS); // not indexed
    const res = await retrieveChunks(ctxWith(new InMemoryVectorStore()), orgId, "elders homes");
    expect(res.map((r) => r.documentTitle)).toEqual(["Housing"]);
  });

  it("degrades to keyword search when the vector store throws", async () => {
    const { orgId } = await setupTenant();
    await seed(orgId, SWIF_DOCS);
    const broken: VectorStore = {
      upsert: async () => {},
      deleteByIds: async () => {},
      query: async () => {
        throw new Error("vectorize down");
      },
    };
    const res = await retrieveChunks(ctxWith(broken), orgId, "construction certifications");
    expect(res[0]?.text).toContain("certifications");
  });

  it("never returns another org's chunks, even if vectors point at them", async () => {
    const a = await setupTenant();
    const b = await setupTenant();
    const vectors = new InMemoryVectorStore();
    await seed(a.orgId, [{ title: "A doc", chunks: ["Org A solar panel installation."] }], vectors);
    const [bDoc] = await seed(
      b.orgId,
      [{ title: "B secret", chunks: ["Org B solar panel installation budget secret."] }],
      vectors,
    );
    // Poison org A's namespace with a vector whose id is org B's chunk.
    const bChunkId = bDoc?.chunkIds[0] ?? "";
    const [vec] = await embedder.embed(["solar panel installation"]);
    await vectors.upsert(a.orgId, [
      { id: bChunkId, values: vec ?? [], metadata: { documentId: bDoc?.docId ?? "", kind: "x" } },
    ]);

    const res = await retrieveChunks(ctxWith(vectors), a.orgId, "solar panel installation", {
      topK: 20,
    });
    expect(res.length).toBeGreaterThan(0);
    for (const r of res) expect(r.documentTitle).toBe("A doc");
    expect(res.map((r) => r.chunkId)).not.toContain(bChunkId);
    // Filters naming another org's document match nothing.
    const viaDocFilter = await retrieveChunks(ctxWith(vectors), a.orgId, "solar", {
      documentIds: [bDoc?.docId ?? ""],
    });
    expect(viaDocFilter).toEqual([]);
  });

  it("filters by kind and documentIds", async () => {
    const { orgId } = await setupTenant();
    const vectors = new InMemoryVectorStore();
    const [trades, housing] = await seed(
      orgId,
      [
        {
          title: "Budget",
          kind: "budget",
          chunks: ["Trades program budget: tools and materials."],
        },
        { title: "Program", chunks: ["Trades program description: tools training."] },
      ],
      vectors,
    );
    const ctx = ctxWith(vectors);
    const byKind = await retrieveChunks(ctx, orgId, "trades tools", { kinds: ["budget"] });
    expect(byKind.map((r) => r.documentKind)).toEqual(["budget"]);
    const byDoc = await retrieveChunks(ctx, orgId, "trades tools", {
      documentIds: [housing?.docId ?? ""],
    });
    expect(byDoc.map((r) => r.documentId)).toEqual([housing?.docId]);
    expect(trades).toBeDefined();
    expect(await retrieveChunks(ctx, orgId, "trades", { kinds: [] })).toEqual([]);
  });

  it("formats results for prompts", async () => {
    const { orgId } = await setupTenant();
    await seed(orgId, SWIF_DOCS);
    const res = await retrieveChunks(ctxWith(new InMemoryVectorStore()), orgId, "plumbing");
    const text = formatChunksForPrompt(res, 2000);
    expect(text).toMatch(/^\[chk_[a-z0-9]+ \| Trades Program\] Our workforce/);
  });
});

describe("retrieveStyleExamples", () => {
  it("prefers awarded past applications and never uses declined ones", async () => {
    const { orgId } = await setupTenant();
    const long = (s: string) =>
      `${s} ${"We partner with families and local employers. ".repeat(6)}`;
    await seed(orgId, [
      {
        title: "Declined 2024",
        kind: "past_application",
        pastOutcome: "declined",
        pastYear: 2024,
        chunks: [long("Declined: apprenticeship trades proposal.")],
      },
      {
        title: "Unknown 2025",
        kind: "past_application",
        pastOutcome: "unknown",
        pastYear: 2025,
        chunks: [long("Unknown: apprenticeship trades proposal.")],
      },
      {
        title: "Awarded 2023",
        kind: "past_application",
        pastOutcome: "awarded",
        pastYear: 2023,
        chunks: [long("Awarded: apprenticeship trades proposal."), long("Awarded: evaluation.")],
      },
      { title: "Program", chunks: [long("Program: apprenticeship trades.")] },
    ]);
    const ctx = ctxWith(new InMemoryVectorStore());

    const two = await retrieveStyleExamples(ctx, orgId, { limit: 2, query: "apprenticeship" });
    expect(two.map((r) => r.documentTitle)).toEqual(["Awarded 2023", "Awarded 2023"]);
    expect(two[0]?.text).toContain("apprenticeship");

    const many = await retrieveStyleExamples(ctx, orgId, { limit: 10 });
    const titles = many.map((r) => r.documentTitle);
    expect(titles[0]).toBe("Awarded 2023");
    expect(titles).toContain("Unknown 2025");
    expect(titles).not.toContain("Declined 2024");
    expect(titles).not.toContain("Program");
    expect(many.every((r) => r.documentKind === "past_application")).toBe(true);
  });

  it("returns [] for an org without past applications and is tenant-scoped", async () => {
    const a = await setupTenant();
    const b = await setupTenant();
    await seed(b.orgId, [
      { title: "B awarded", kind: "past_application", pastOutcome: "awarded", chunks: ["x"] },
    ]);
    expect(await retrieveStyleExamples(ctxWith(new InMemoryVectorStore()), a.orgId)).toEqual([]);
  });
});

describe("POST /api/orgs/:orgId/search", () => {
  it("searches the caller's org", async () => {
    const { orgId, userId } = await setupTenant("viewer");
    await seed(orgId, SWIF_DOCS);
    const res = await api(`/api/orgs/${orgId}/search`, {
      method: "POST",
      as: userId,
      json: { query: "Navajo youth carpentry", topK: 3 },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      items: {
        chunkId: string;
        documentId: string;
        documentTitle: string;
        text: string;
        score: number;
      }[];
    };
    expect(body.items.length).toBeGreaterThan(0);
    expect(body.items.length).toBeLessThanOrEqual(3);
    expect(body.items[0]).toMatchObject({ documentTitle: "Trades Program" });
    expect(typeof body.items[0]?.score).toBe("number");
  });

  it("validates input", async () => {
    const { orgId, userId } = await setupTenant();
    for (const json of [{ query: "" }, { query: "x".repeat(501) }, { query: "ok", topK: 21 }]) {
      const res = await api(`/api/orgs/${orgId}/search`, { method: "POST", as: userId, json });
      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: { code: string } };
      expect(body.error.code).toBe("validation_error");
    }
  });

  it("returns 404 for non-members and never leaks other orgs' chunks", async () => {
    const a = await setupTenant();
    const b = await setupTenant();
    await seed(b.orgId, [{ title: "B only", chunks: ["Zebrafish aquaculture secret plan."] }]);
    const cross = await api(`/api/orgs/${b.orgId}/search`, {
      method: "POST",
      as: a.userId,
      json: { query: "zebrafish" },
    });
    expect(cross.status).toBe(404);
    const own = await api(`/api/orgs/${a.orgId}/search`, {
      method: "POST",
      as: a.userId,
      json: { query: "zebrafish aquaculture" },
    });
    expect(own.status).toBe(200);
    expect(((await own.json()) as { items: unknown[] }).items).toEqual([]);
  });
});
