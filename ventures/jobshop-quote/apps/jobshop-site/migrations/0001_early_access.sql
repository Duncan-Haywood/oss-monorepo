-- Early-access requests from the public form (src/worker/early-access.ts).
-- Not tenant data: these are prospects who asked to try the product. One row per address; a repeat
-- submission updates the row (answers, consent version) and bumps submit_count.
CREATE TABLE early_access_requests (
  id TEXT PRIMARY KEY NOT NULL,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  shop TEXT NOT NULL,
  role TEXT NOT NULL,
  -- JSON array of process keys (src/shared/early-access.ts PROCESSES).
  processes TEXT NOT NULL,
  rfqs_per_week TEXT NOT NULL,
  quoting_today TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  consent_text_version TEXT NOT NULL,
  -- Site path of the form the request came from.
  consent_source TEXT NOT NULL,
  -- Salted SHA-256 of the client IP when IP_HASH_SALT is set; NULL otherwise. Raw IPs are never stored.
  consent_ip_hash TEXT,
  -- new -> contacted -> invited | declined, set by hand (see README).
  status TEXT NOT NULL DEFAULT 'new',
  submit_count INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX early_access_requests_created_at ON early_access_requests (created_at);
