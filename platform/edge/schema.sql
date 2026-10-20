-- D1 schema for platform/edge/worker.mjs. Apply once:
--   npx wrangler d1 execute monorepo-projects-edge --remote --file platform/edge/schema.sql
-- Re-running it is harmless.

-- One integer per (UTC day, page slug), plus `ref:<tag>` rows for arrivals by
-- a channel link. The same shape as platform/counter's JSON store.
CREATE TABLE IF NOT EXISTS counts (
  day  TEXT    NOT NULL,
  slug TEXT    NOT NULL,
  n    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, slug)
);

-- How many feedback issues were opened each day, for the site-wide daily cap.
CREATE TABLE IF NOT EXISTS feedback_daily (
  day TEXT    PRIMARY KEY,
  n   INTEGER NOT NULL DEFAULT 0
);
