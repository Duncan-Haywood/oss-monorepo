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

-- Messages sent through the site's feedback form. `day` is the only time kept.
-- Nothing about the sender is stored.
CREATE TABLE IF NOT EXISTS feedback (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  day     TEXT NOT NULL,
  type    TEXT NOT NULL,
  tool    TEXT NOT NULL DEFAULT '',
  page    TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL
);

-- How many feedback messages were accepted each day, for the site-wide daily cap.
CREATE TABLE IF NOT EXISTS feedback_daily (
  day TEXT    PRIMARY KEY,
  n   INTEGER NOT NULL DEFAULT 0
);
