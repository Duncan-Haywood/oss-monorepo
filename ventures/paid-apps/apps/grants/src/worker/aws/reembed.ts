// Vectors after the D1 → Postgres move (docs/AWS.md, cutover step 4). Vectorize has no export, so
// chunks copied from D1 arrive without vectors. Every job tick embeds up to `limit` chunks that
// have no row in aws_vectors yet, with the same embedder and input text as ingestion
// (services/ingestion/jobs.ts). Each chunk is written to the namespace of ITS OWN org, taken from
// the chunk row joined to its document within the same org. Idle (one cheap query) once caught up.
import type { Embedder } from "../ports/embedder";
import type { VectorStore } from "../ports/vector-store";
import { embeddingInput } from "../services/ingestion/jobs";
import type { PgClient } from "./pg-d1";

interface MissingChunk {
  id: string;
  org_id: string;
  document_id: string;
  heading: string | null;
  text: string;
  kind: string;
}

export async function reembedMissingVectors(
  db: PgClient,
  embedder: Embedder,
  vectors: VectorStore,
  opts: { limit?: number; batch?: number } = {},
): Promise<number> {
  const r = await db.query({
    text: `SELECT c.id, c.org_id, c.document_id, c.heading, c.text, d.kind
             FROM document_chunks c
             JOIN documents d ON d.id = c.document_id AND d.org_id = c.org_id
             LEFT JOIN aws_vectors v ON v.namespace = c.org_id AND v.id = c.id
            WHERE v.id IS NULL
            ORDER BY c.org_id, c.document_id, c.ordinal
            LIMIT $1`,
    values: [opts.limit ?? 200],
  });
  const rows = r.rows as MissingChunk[];
  const size = opts.batch ?? 50;
  let done = 0;
  for (let i = 0; i < rows.length; ) {
    const orgId = (rows[i] as MissingChunk).org_id;
    const group: MissingChunk[] = [];
    while (i < rows.length && group.length < size && (rows[i] as MissingChunk).org_id === orgId) {
      group.push(rows[i] as MissingChunk);
      i++;
    }
    const embedded = await embedder.embed(group.map((c) => embeddingInput(c.heading, c.text)));
    if (embedded.length !== group.length)
      throw new Error("embedder returned a different number of vectors");
    await vectors.upsert(
      orgId,
      group.map((c, j) => ({
        id: c.id,
        values: embedded[j] ?? [],
        metadata: { documentId: c.document_id, kind: c.kind },
      })),
    );
    done += group.length;
  }
  return done;
}
