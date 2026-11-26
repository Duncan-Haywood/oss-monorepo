// Per-tenant vector search. namespace MUST be the orgId (Vectorize namespaces isolate tenants).
export interface VectorRecord {
  id: string; // chunk id
  values: number[];
  metadata: { documentId: string; kind: string; [k: string]: string | number | boolean };
}

export interface VectorMatch {
  id: string;
  score: number;
  metadata: Record<string, unknown>;
}

export interface VectorStore {
  upsert(namespace: string, records: VectorRecord[]): Promise<void>;
  query(
    namespace: string,
    vector: number[],
    opts: { topK: number; filter?: Record<string, string> },
  ): Promise<VectorMatch[]>;
  deleteByIds(namespace: string, ids: string[]): Promise<void>;
}
