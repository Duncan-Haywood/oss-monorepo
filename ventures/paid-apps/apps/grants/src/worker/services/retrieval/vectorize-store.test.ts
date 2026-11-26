import { VectorizeStore } from "@worker/ports/vectorize-store";
import { describe, expect, it } from "vitest";

function mockIndex(matches: { id: string; score: number; namespace?: string }[] = []) {
  const calls = {
    upsert: [] as unknown[][],
    query: [] as unknown[],
    deleteByIds: [] as string[][],
  };
  const index = {
    upsert: async (v: unknown[]) => {
      calls.upsert.push(v);
      return { mutationId: "m" };
    },
    query: async (_vec: number[], opts: unknown) => {
      calls.query.push(opts);
      return { matches, count: matches.length };
    },
    deleteByIds: async (ids: string[]) => {
      calls.deleteByIds.push(ids);
      return { mutationId: "m" };
    },
  };
  return { store: new VectorizeStore(index as unknown as Vectorize), calls };
}

describe("VectorizeStore", () => {
  it("batches upserts and deletes within Vectorize limits, with namespace on every vector", async () => {
    const { store, calls } = mockIndex();
    const recs = Array.from({ length: 1201 }, (_, i) => ({
      id: `chk_${i}`,
      values: [1, 0],
      metadata: { documentId: "doc_1", kind: "budget" },
    }));
    await store.upsert("org_a", recs);
    expect(calls.upsert.map((b) => b.length)).toEqual([500, 500, 201]);
    expect(
      calls.upsert.flat().every((v) => (v as { namespace: string }).namespace === "org_a"),
    ).toBe(true);
    await store.deleteByIds(
      "org_a",
      Array.from({ length: 2500 }, (_, i) => `chk_${i}`),
    );
    expect(calls.deleteByIds.map((b) => b.length)).toEqual([1000, 1000, 500]);
    await store.upsert("org_a", []);
    expect(calls.upsert).toHaveLength(3);
  });

  it("queries the namespace, clamps topK and drops foreign-namespace matches", async () => {
    const { store, calls } = mockIndex([
      { id: "chk_1", score: 0.9, namespace: "org_a" },
      { id: "chk_2", score: 0.8, namespace: "org_b" },
      { id: "chk_3", score: 0.7 },
    ]);
    const res = await store.query("org_a", [1, 0], { topK: 500 });
    expect(res.map((m) => m.id)).toEqual(["chk_1", "chk_3"]);
    expect(calls.query[0]).toEqual({ topK: 100, namespace: "org_a", returnMetadata: "indexed" });
  });

  it("refuses to run without a namespace", async () => {
    const { store } = mockIndex();
    await expect(store.query("", [1], { topK: 5 })).rejects.toThrow(/namespace/);
    await expect(store.upsert("", [])).rejects.toThrow(/namespace/);
    await expect(store.deleteByIds("", ["x"])).rejects.toThrow(/namespace/);
  });
});
