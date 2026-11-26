// VectorStore on AWS: embeddings in the product's Postgres database instead of Vectorize
// (docs/AWS.md). The namespace is the orgId, exactly as with Vectorize: every statement filters
// by it, so one org's query can never score another org's chunks.
//
// Scoring is exact cosine similarity in the Lambda over that org's rows. Grants orgs hold
// hundreds to low thousands of chunks, which this handles in milliseconds; when an org outgrows
// it, the upgrade is pgvector (a trusted extension on RDS) with the same table and interface.
import type { VectorMatch, VectorRecord, VectorStore } from "../ports/vector-store";
import type { PgClient } from "./pg-d1";

export const VECTORS_TABLE = "aws_vectors";

export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const x = a[i] as number;
    const y = b[i] as number;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

function requireNamespace(namespace: string): string {
  if (!namespace) throw new Error("vector namespace (orgId) is required");
  return namespace;
}

export class PgVectorStore implements VectorStore {
  constructor(private readonly db: PgClient) {}

  async upsert(namespace: string, records: VectorRecord[]): Promise<void> {
    const ns = requireNamespace(namespace);
    for (const r of records) {
      await this.db.query({
        text: `INSERT INTO ${VECTORS_TABLE} (namespace, id, embedding, metadata)
               VALUES ($1, $2, $3, $4)
               ON CONFLICT (namespace, id) DO UPDATE SET embedding = EXCLUDED.embedding, metadata = EXCLUDED.metadata`,
        values: [ns, r.id, JSON.stringify(r.values), JSON.stringify(r.metadata)],
      });
    }
  }

  async query(
    namespace: string,
    vector: number[],
    opts: { topK: number; filter?: Record<string, string> },
  ): Promise<VectorMatch[]> {
    const ns = requireNamespace(namespace);
    const values: unknown[] = [ns];
    const where = [`namespace = $1`];
    for (const [k, v] of Object.entries(opts.filter ?? {})) {
      values.push(k, v);
      where.push(`(metadata::jsonb ->> $${values.length - 1}) = $${values.length}`);
    }
    const r = await this.db.query({
      text: `SELECT id, embedding, metadata FROM ${VECTORS_TABLE} WHERE ${where.join(" AND ")}`,
      values,
    });
    const rows = r.rows as { id: string; embedding: string; metadata: string }[];
    return rows
      .map((row) => ({
        id: row.id,
        score: cosine(vector, JSON.parse(row.embedding) as number[]),
        metadata: JSON.parse(row.metadata) as Record<string, unknown>,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.max(0, opts.topK));
  }

  async deleteByIds(namespace: string, ids: string[]): Promise<void> {
    const ns = requireNamespace(namespace);
    if (!ids.length) return;
    await this.db.query({
      text: `DELETE FROM ${VECTORS_TABLE} WHERE namespace = $1 AND id = ANY($2::text[])`,
      values: [ns, ids],
    });
  }
}
