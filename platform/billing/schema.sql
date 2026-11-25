-- D1 schema for the billing Worker (worker.mjs beside this file). Apply once,
-- from the owner's machine against the billing account's database:
--   npx wrangler d1 execute billing --remote --file schema.sql
-- Re-running it is harmless.

-- Licence keys for paid packs (server.mjs). A row holds the signed key, the
-- product and the day, keyed by the SHA-256 of the claim code only the paying
-- browser knows. Nothing about the buyer is stored.
CREATE TABLE IF NOT EXISTS licences (
  claim_hash TEXT PRIMARY KEY,
  product    TEXT NOT NULL,
  licence    TEXT NOT NULL,
  created    TEXT NOT NULL
);

-- The newest key for each Paddle subscription, so a lapsed key can fetch its
-- renewal (POST /billing/renew).
CREATE TABLE IF NOT EXISTS licence_subs (
  sub_id  TEXT PRIMARY KEY,
  licence TEXT NOT NULL,
  exp     INTEGER NOT NULL
);
