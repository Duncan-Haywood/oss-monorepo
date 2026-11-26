-- Hand-written (not generated): tables only the AWS runtime uses (docs/AWS.md).
-- Same storage model as the generated schema: epoch-ms bigints, JSON in text.

-- JOBS queue (src/worker/aws/pg-queue.ts). Messages carry ids only, never document text.
CREATE TABLE IF NOT EXISTS aws_jobs (
  id            text PRIMARY KEY,
  body          text NOT NULL,
  available_at  bigint NOT NULL,
  attempts      integer NOT NULL DEFAULT 0,
  locked_until  bigint NOT NULL DEFAULT 0,
  dead_at       bigint,
  created_at    bigint NOT NULL
);
CREATE INDEX IF NOT EXISTS aws_jobs_due_idx ON aws_jobs (available_at, created_at) WHERE dead_at IS NULL;

-- Per-org embeddings (src/worker/aws/pg-vector-store.ts). namespace = orgId; every query filters by it.
CREATE TABLE IF NOT EXISTS aws_vectors (
  namespace  text NOT NULL,
  id         text NOT NULL,
  embedding  text NOT NULL,
  metadata   text NOT NULL DEFAULT '{}',
  PRIMARY KEY (namespace, id)
);

-- Small runtime state (the entitlement sync watermark: services/billing/entitlement-sync.ts).
CREATE TABLE IF NOT EXISTS aws_state (
  key    text PRIMARY KEY,
  value  text NOT NULL
);
