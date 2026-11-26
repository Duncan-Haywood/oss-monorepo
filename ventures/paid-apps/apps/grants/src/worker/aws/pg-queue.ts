// The `JOBS` queue on AWS: a Postgres table plus a drain run by the per-minute schedule
// (docs/AWS.md). The starter has no queue binding yet (its README: "Queues: SQS + a consumer
// Lambda, not in the starter yet"); a table in the product database needs no new AWS resource,
// keeps jobs transactional with the data they refer to, and reuses the Worker's own consumer
// (queues/consumer.ts handleQueueBatch), so retries, acks and non-retryable errors behave the same.
//
// Semantics mirror wrangler.jsonc's consumer: batches of up to 5, 3 retries, then dead-lettered
// (rows stay with `dead_at` set for inspection, like the Worker's DLQ). Messages carry ids only.
import type { PgClient, PgPool } from "./pg-d1";
import { d1TypeParsers } from "./pg-d1";

export const JOBS_TABLE = "aws_jobs";
export const MAX_RETRIES = 3;
export const BATCH_SIZE = 5;
/** A claimed job is invisible to other drains for this long (longer than the Lambda timeout). */
export const LEASE_MS = 15 * 60 * 1000;

function newJobId(): string {
  return `ajb_${crypto.randomUUID().replace(/-/g, "")}`;
}

/** A Workers `Queue`-shaped producer that inserts into aws_jobs. */
export class PgQueue<Body = unknown> {
  constructor(
    private readonly db: PgClient,
    private readonly now: () => number = Date.now,
  ) {}

  async send(body: Body, opts?: { delaySeconds?: number }): Promise<void> {
    await this.sendBatch([{ body, delaySeconds: opts?.delaySeconds }]);
  }

  async sendBatch(messages: Iterable<{ body: Body; delaySeconds?: number }>): Promise<void> {
    const now = this.now();
    for (const m of messages) {
      await this.db.query({
        text: `INSERT INTO ${JOBS_TABLE} (id, body, available_at, attempts, locked_until, created_at)
               VALUES ($1, $2, $3, 0, 0, $4)`,
        values: [newJobId(), JSON.stringify(m.body), now + (m.delaySeconds ?? 0) * 1000, now],
      });
    }
  }
}

interface ClaimedRow {
  id: string;
  body: string;
  attempts: number;
}

export interface QueueMessageLike<Body> {
  id: string;
  timestamp: Date;
  body: Body;
  attempts: number;
  ack(): void;
  retry(opts?: { delaySeconds?: number }): void;
}

export interface MessageBatchLike<Body> {
  queue: string;
  messages: QueueMessageLike<Body>[];
  ackAll(): void;
  retryAll(opts?: { delaySeconds?: number }): void;
}

export interface DrainResult {
  claimed: number;
  acked: number;
  retried: number;
  dead: number;
}

/** Claims due jobs (FOR UPDATE SKIP LOCKED, so concurrent drains never share a job). */
export async function claimJobs(
  db: PgClient,
  now: number,
  limit = BATCH_SIZE,
): Promise<ClaimedRow[]> {
  const r = await db.query({
    text: `UPDATE ${JOBS_TABLE} SET locked_until = $1, attempts = attempts + 1
           WHERE id IN (
             SELECT id FROM ${JOBS_TABLE}
             WHERE dead_at IS NULL AND available_at <= $2 AND locked_until <= $2
             ORDER BY available_at, created_at
             LIMIT $3
             FOR UPDATE SKIP LOCKED)
           RETURNING id, body, attempts`,
    values: [now + LEASE_MS, now, limit],
    types: d1TypeParsers,
  });
  return r.rows as ClaimedRow[];
}

/**
 * One drain pass: claims up to `batchSize` jobs, hands them to `consume` (the Worker's
 * handleQueueBatch) as a MessageBatch, then applies each message's ack/retry. A message the
 * consumer neither acked nor retried is retried, as Workers does. Returns what happened.
 */
export async function drainOnce<Body>(
  db: PgPool,
  consume: (batch: MessageBatchLike<Body>) => Promise<void>,
  opts: { now?: () => number; batchSize?: number } = {},
): Promise<DrainResult> {
  const now = opts.now ?? Date.now;
  const rows = await claimJobs(db, now(), opts.batchSize ?? BATCH_SIZE);
  const outcome = new Map<string, { kind: "ack" } | { kind: "retry"; delaySeconds: number }>();
  const messages: QueueMessageLike<Body>[] = rows.map((row) => ({
    id: row.id,
    timestamp: new Date(now()),
    body: JSON.parse(row.body) as Body,
    // Workers counts attempts from 1 for the first delivery; so does attempts + 1 at claim time.
    attempts: row.attempts,
    ack: () => outcome.set(row.id, { kind: "ack" }),
    retry: (o) => outcome.set(row.id, { kind: "retry", delaySeconds: o?.delaySeconds ?? 30 }),
  }));
  if (!messages.length) return { claimed: 0, acked: 0, retried: 0, dead: 0 };
  try {
    await consume({
      queue: JOBS_TABLE,
      messages,
      ackAll: () => {
        for (const m of messages) m.ack();
      },
      retryAll: (o) => {
        for (const m of messages) m.retry(o);
      },
    });
  } catch {
    // The whole batch failed: every message not explicitly acked is retried.
  }
  const result: DrainResult = { claimed: rows.length, acked: 0, retried: 0, dead: 0 };
  for (const row of rows) {
    const o = outcome.get(row.id) ?? { kind: "retry", delaySeconds: 30 };
    if (o.kind === "ack") {
      await db.query({ text: `DELETE FROM ${JOBS_TABLE} WHERE id = $1`, values: [row.id] });
      result.acked++;
    } else if (row.attempts > MAX_RETRIES) {
      await db.query({
        text: `UPDATE ${JOBS_TABLE} SET dead_at = $2, locked_until = 0 WHERE id = $1`,
        values: [row.id, now()],
      });
      result.dead++;
    } else {
      await db.query({
        text: `UPDATE ${JOBS_TABLE} SET available_at = $2, locked_until = 0 WHERE id = $1`,
        values: [row.id, now() + o.delaySeconds * 1000],
      });
      result.retried++;
    }
  }
  return result;
}

/** Drains until no job is due or the time budget is spent (the schedule fires every minute). */
export async function drainJobs<Body>(
  db: PgPool,
  consume: (batch: MessageBatchLike<Body>) => Promise<void>,
  opts: { budgetMs?: number; now?: () => number } = {},
): Promise<DrainResult> {
  const now = opts.now ?? Date.now;
  const deadline = now() + (opts.budgetMs ?? 4 * 60 * 1000);
  const total: DrainResult = { claimed: 0, acked: 0, retried: 0, dead: 0 };
  while (now() < deadline) {
    const r = await drainOnce(db, consume, { now });
    total.claimed += r.claimed;
    total.acked += r.acked;
    total.retried += r.retried;
    total.dead += r.dead;
    if (r.claimed === 0) break;
  }
  return total;
}
