// Vectorize adapter (OWNER: retrieval agent). namespace = orgId for tenant isolation.
//
// Limits honored here (Workers binding):
// - upsert: ≤ 1000 vectors per call (we send 500 to bound request size).
// - deleteByIds: ≤ 1000 ids per call.
// - query topK: ≤ 100 with returnMetadata "indexed"/"none" (only ≤ 20 with "all"), so we ask for
//   "indexed". Callers must not trust metadata for tenancy anyway: retrieval re-reads chunks from D1.
// - namespace: required here; a query without one would search every tenant's vectors.
// - metadata filters only work on properties with a metadata index created BEFORE the vectors were
//   inserted (infra: `wrangler vectorize create-metadata-index <index> --property-name documentId
//   --type string` and the same for `kind`). Retrieval does not depend on filters.
import type { VectorMatch, VectorRecord, VectorStore } from "./vector-store";

export const VECTORIZE_UPSERT_BATCH = 500;
export const VECTORIZE_DELETE_BATCH = 1000;
export const VECTORIZE_MAX_TOP_K = 100;
const MAX_NAMESPACE_BYTES = 64;

/** Both the beta (`VectorizeIndex`) and v2 (`Vectorize`) bindings share these method shapes. */
type VectorizeBinding = Pick<VectorizeIndex, "upsert" | "query" | "deleteByIds">;

function assertNamespace(namespace: string) {
  if (!namespace || new TextEncoder().encode(namespace).length > MAX_NAMESPACE_BYTES)
    throw new Error("VectorizeStore: a valid namespace (orgId) is required");
}

function chunked<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export class VectorizeStore implements VectorStore {
  constructor(private index: VectorizeBinding | Vectorize) {}

  async upsert(namespace: string, records: VectorRecord[]) {
    assertNamespace(namespace);
    for (const batch of chunked(records, VECTORIZE_UPSERT_BATCH)) {
      await this.index.upsert(
        batch.map((r) => ({ id: r.id, values: r.values, namespace, metadata: r.metadata })),
      );
    }
  }

  async query(
    namespace: string,
    vector: number[],
    opts: { topK: number; filter?: Record<string, string> },
  ): Promise<VectorMatch[]> {
    assertNamespace(namespace);
    const topK = Math.min(VECTORIZE_MAX_TOP_K, Math.max(1, Math.floor(opts.topK)));
    const res = await this.index.query(vector, {
      topK,
      namespace,
      returnMetadata: "indexed",
      ...(opts.filter && Object.keys(opts.filter).length ? { filter: opts.filter } : {}),
    });
    return (
      res.matches
        // Defense in depth: never surface a match that reports a different namespace.
        .filter((m) => m.namespace === undefined || m.namespace === namespace)
        .map(
          (m): VectorMatch => ({
            id: m.id,
            score: m.score,
            metadata: (m.metadata ?? {}) as Record<string, unknown>,
          }),
        )
    );
  }

  /**
   * Vectorize deletes by id across the whole index (no namespace parameter). Ids are globally
   * unique chunk ids, and callers pass ids they loaded from D1 scoped to this org.
   */
  async deleteByIds(namespace: string, ids: string[]) {
    assertNamespace(namespace);
    for (const batch of chunked([...new Set(ids)], VECTORIZE_DELETE_BATCH))
      await this.index.deleteByIds(batch);
  }
}
