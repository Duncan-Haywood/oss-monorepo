-- The sign-in gate's HMAC key for static sites (src/site.mjs): one row, made by the app on first use.
-- Deleting the row signs everyone out; the next request makes a new key.
CREATE TABLE IF NOT EXISTS gate_key (
  id   int PRIMARY KEY CHECK (id = 1),
  key  bytea NOT NULL CHECK (length(key) = 32)
);
