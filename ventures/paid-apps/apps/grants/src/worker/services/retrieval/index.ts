// Hybrid retrieval over an org's document chunks: semantic (Vectorize, namespace = orgId) +
// keyword (BM25-lite over D1), merged with reciprocal-rank fusion.
//
// Tenancy: vector matches are only candidate ids. Every chunk returned is re-read from D1 with
// `org_id = orgId` on both the chunk and its document — vector metadata is never trusted.
// Resilience: if the vector store is empty/unavailable (offline demo, in-memory vectors lost),
// keyword retrieval alone still returns results.
import type { DocumentKind, PastOutcome } from "@shared/enums";
import { and, asc, eq, inArray, like, or, type SQL, sql } from "drizzle-orm";
import type { AppContext } from "../../context";
import { documentChunks, documents } from "../../db/schema";
import { bm25, queryTerms, reciprocalRankFusion } from "./ranking";

export { formatChunksForPrompt } from "./format";
export { bm25, queryTerms, reciprocalRankFusion, stem, tokenize } from "./ranking";

export interface RetrievedChunk {
  chunkId: string;
  documentId: string;
  documentTitle: string;
  documentKind: DocumentKind;
  heading: string | null;
  text: string;
  /** Fused relevance in 0..1 (1 = ranked first by every retriever). 0 for non-ranked fillers. */
  score: number;
}

export interface RetrieveOptions {
  topK?: number;
  /** Restrict to these document kinds. An empty array matches nothing. */
  kinds?: DocumentKind[];
  /** Restrict to these documents (must belong to the org). An empty array matches nothing. */
  documentIds?: string[];
}

export const DEFAULT_TOP_K = 8;
const MAX_TOP_K = 50;
/** Max candidates requested from Vectorize (its topK cap with returnMetadata "indexed"/"none"). */
const VECTOR_CANDIDATES_MAX = 100;
/** Cap on chunk rows scanned for keyword scoring. */
export const KEYWORD_SCAN_LIMIT = 2000;
/** D1 allows 100 bound parameters per statement; keep IN lists well under it. */
const IN_BATCH = 80;
const MAX_SQL_DOC_FILTER = 40;

interface ChunkRow {
  id: string;
  documentId: string;
  heading: string | null;
  text: string;
  documentTitle: string;
  documentKind: DocumentKind;
}

const chunkColumns = {
  id: documentChunks.id,
  documentId: documentChunks.documentId,
  heading: documentChunks.heading,
  text: documentChunks.text,
  documentTitle: documents.title,
  documentKind: documents.kind,
};

const clamp = (n: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, Number.isFinite(n) ? Math.floor(n) : lo));

function rowFilter(opts: RetrieveOptions) {
  const kinds = opts.kinds ? new Set(opts.kinds) : null;
  const docs = opts.documentIds ? new Set(opts.documentIds) : null;
  return (r: ChunkRow) =>
    (!kinds || kinds.has(r.documentKind)) && (!docs || docs.has(r.documentId));
}

/** Load chunks by id, scoped to the org (chunk AND document must belong to orgId). */
async function hydrateChunks(
  ctx: AppContext,
  orgId: string,
  ids: string[],
): Promise<Map<string, ChunkRow>> {
  const out = new Map<string, ChunkRow>();
  const unique = [...new Set(ids)];
  for (let i = 0; i < unique.length; i += IN_BATCH) {
    const batch = unique.slice(i, i + IN_BATCH);
    const rows = await ctx.db
      .select(chunkColumns)
      .from(documentChunks)
      .innerJoin(documents, eq(documents.id, documentChunks.documentId))
      .where(
        and(
          eq(documentChunks.orgId, orgId),
          eq(documents.orgId, orgId),
          inArray(documentChunks.id, batch),
        ),
      )
      .all();
    for (const r of rows) out.set(r.id, r);
  }
  return out;
}

async function vectorCandidates(
  ctx: AppContext,
  orgId: string,
  query: string,
  n: number,
): Promise<string[]> {
  try {
    const [vec] = await ctx.embedder.embed([query]);
    if (!vec?.length) return [];
    const matches = await ctx.vectors.query(orgId, vec, { topK: n });
    return matches.filter((m) => m.score > 0).map((m) => m.id);
  } catch (e) {
    // Embedding/Vectorize outages degrade to keyword-only search.
    ctx.logger.warn("retrieval.vector_failed", { orgId, error: String(e) });
    return [];
  }
}

async function keywordCandidates(
  ctx: AppContext,
  orgId: string,
  query: string,
  opts: RetrieveOptions,
): Promise<{ ranked: string[]; rows: ChunkRow[] }> {
  const terms = queryTerms(query);
  if (terms.length === 0) return { ranked: [], rows: [] };

  const likes: SQL[] = [];
  for (const t of terms) {
    likes.push(like(documentChunks.text, `%${t}%`));
    likes.push(like(documentChunks.heading, `%${t}%`));
  }
  const conds: (SQL | undefined)[] = [
    eq(documentChunks.orgId, orgId),
    eq(documents.orgId, orgId),
    or(...likes),
  ];
  if (opts.kinds) conds.push(inArray(documents.kind, opts.kinds));
  if (opts.documentIds && opts.documentIds.length <= MAX_SQL_DOC_FILTER)
    conds.push(inArray(documentChunks.documentId, opts.documentIds));

  const [rows, total] = await Promise.all([
    ctx.db
      .select(chunkColumns)
      .from(documentChunks)
      .innerJoin(documents, eq(documents.id, documentChunks.documentId))
      .where(and(...conds))
      .limit(KEYWORD_SCAN_LIMIT)
      .all(),
    // Corpus size for IDF only, so an approximation is fine: summing documents.chunk_count reads
    // ~1 row per document instead of walking every chunk index entry in the org.
    ctx.db
      .select({ n: sql<number>`coalesce(sum(${documents.chunkCount}), 0)` })
      .from(documents)
      .where(and(eq(documents.orgId, orgId), eq(documents.status, "ready")))
      .get(),
  ]);
  const keep = rowFilter(opts);
  const filtered = rows.filter(keep);
  const scored = bm25(
    filtered.map((r) => ({ id: r.id, text: r.heading ? `${r.heading}\n${r.text}` : r.text })),
    terms,
    { totalDocs: Number(total?.n ?? 0) || filtered.length },
  );
  return { ranked: scored.map((s) => s.id), rows: filtered };
}

/**
 * Hybrid semantic + keyword search over the org's chunks. Always scoped to `orgId`.
 */
export async function retrieveChunks(
  ctx: AppContext,
  orgId: string,
  query: string,
  opts: RetrieveOptions = {},
): Promise<RetrievedChunk[]> {
  const q = query.trim().slice(0, 2000);
  if (!orgId || !q) return [];
  if (opts.kinds?.length === 0 || opts.documentIds?.length === 0) return [];
  const topK = clamp(opts.topK ?? DEFAULT_TOP_K, 1, MAX_TOP_K);
  const filtered = Boolean(opts.kinds || opts.documentIds);
  // Over-fetch vectors (and more when filtering in D1, since no Vectorize metadata filter is used).
  const nVec = filtered ? VECTOR_CANDIDATES_MAX : Math.min(VECTOR_CANDIDATES_MAX, topK * 4 + 10);

  const [vecIds, kw] = await Promise.all([
    vectorCandidates(ctx, orgId, q, nVec),
    keywordCandidates(ctx, orgId, q, opts),
  ]);

  const rows = new Map<string, ChunkRow>(kw.rows.map((r) => [r.id, r]));
  const missing = vecIds.filter((id) => !rows.has(id));
  if (missing.length)
    for (const [id, r] of await hydrateChunks(ctx, orgId, missing)) rows.set(id, r);

  const keep = rowFilter(opts);
  // Drop vector ids that are not this org's chunks (stale vectors, deleted docs, foreign ids).
  const vecRanked = vecIds.filter((id) => {
    const r = rows.get(id);
    return r !== undefined && keep(r);
  });

  const fused = reciprocalRankFusion([{ ids: vecRanked }, { ids: kw.ranked }]);
  const out: RetrievedChunk[] = [];
  for (const f of fused) {
    const r = rows.get(f.id);
    if (!r) continue;
    out.push(toRetrieved(r, f.score));
    if (out.length >= topK) break;
  }
  return out;
}

function toRetrieved(r: ChunkRow, score: number): RetrievedChunk {
  return {
    chunkId: r.id,
    documentId: r.documentId,
    documentTitle: r.documentTitle,
    documentKind: r.documentKind,
    heading: r.heading,
    text: r.text,
    score,
  };
}

const MIN_STYLE_CHARS = 200;

/**
 * Style references for drafting: chunks of the org's past applications, awarded ones first,
 * falling back to pending/unknown outcomes (never declined). Ranked by relevance to `query` when
 * given, topped up with the opening chunks of each application (newest first).
 * These are STYLE examples only — never a source of facts.
 */
export async function retrieveStyleExamples(
  ctx: AppContext,
  orgId: string,
  opts: { limit?: number; query?: string } = {},
): Promise<RetrievedChunk[]> {
  if (!orgId) return [];
  const limit = clamp(opts.limit ?? 4, 1, 20);
  const docs = await ctx.db
    .select({
      id: documents.id,
      pastOutcome: documents.pastOutcome,
      pastYear: documents.pastYear,
      createdAt: documents.createdAt,
    })
    .from(documents)
    .where(and(eq(documents.orgId, orgId), eq(documents.kind, "past_application")))
    .all();
  if (docs.length === 0) return [];

  docs.sort(
    (a, b) =>
      (b.pastYear ?? 0) - (a.pastYear ?? 0) || b.createdAt.getTime() - a.createdAt.getTime(),
  );
  const tierOf = (o: PastOutcome | null) => (o === "awarded" ? 0 : o === "declined" ? -1 : 1);
  const tiers = [
    docs.filter((d) => tierOf(d.pastOutcome) === 0).map((d) => d.id),
    docs.filter((d) => tierOf(d.pastOutcome) === 1).map((d) => d.id),
  ];

  const out: RetrievedChunk[] = [];
  const seen = new Set<string>();
  const push = (c: RetrievedChunk) => {
    if (seen.has(c.chunkId) || out.length >= limit) return;
    seen.add(c.chunkId);
    out.push(c);
  };

  for (const tier of tiers) {
    if (out.length >= limit) break;
    const docIds = tier.slice(0, MAX_SQL_DOC_FILTER);
    if (docIds.length === 0) continue;
    const q = opts.query?.trim();
    if (q) {
      const ranked = await retrieveChunks(ctx, orgId, q, {
        topK: limit,
        kinds: ["past_application"],
        documentIds: docIds,
      });
      for (const c of ranked) push(c);
    }
    if (out.length >= limit) break;
    for (const c of await openingChunks(ctx, orgId, docIds, limit)) push(c);
  }
  return out;
}

/** First substantive chunks of each document, interleaved round-robin in `docIds` order. */
async function openingChunks(
  ctx: AppContext,
  orgId: string,
  docIds: string[],
  perDoc: number,
): Promise<RetrievedChunk[]> {
  const rows = await ctx.db
    .select({ ...chunkColumns, ordinal: documentChunks.ordinal })
    .from(documentChunks)
    .innerJoin(documents, eq(documents.id, documentChunks.documentId))
    .where(
      and(
        eq(documentChunks.orgId, orgId),
        eq(documents.orgId, orgId),
        inArray(documentChunks.documentId, docIds),
      ),
    )
    .orderBy(asc(documentChunks.documentId), asc(documentChunks.ordinal))
    .limit(500)
    .all();
  const byDoc = new Map<string, ChunkRow[]>();
  for (const r of rows) {
    const list = byDoc.get(r.documentId) ?? [];
    list.push(r);
    byDoc.set(r.documentId, list);
  }
  const queues = docIds.map((id) => {
    const list = byDoc.get(id) ?? [];
    const substantive = list.filter((r) => r.text.trim().length >= MIN_STYLE_CHARS);
    return (substantive.length ? substantive : list).slice(0, perDoc);
  });
  const out: RetrievedChunk[] = [];
  for (let i = 0; i < perDoc; i++)
    for (const q of queues) {
      const r = q[i];
      if (r) out.push(toRetrieved(r, 0));
    }
  return out;
}
