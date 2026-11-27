-- Early-access list (double opt-in). Public prospects, not tenant data: no org_id.
-- Raw tokens and IP addresses are never stored, only SHA-256 hashes.
CREATE TABLE early_access_signups (
  id TEXT PRIMARY KEY,
  -- Normalized (trimmed, lowercased).
  email TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed')),
  cmmc_level TEXT CHECK (cmmc_level IN ('l1', 'l2', 'unsure')),
  shop_size TEXT,
  -- Site path of the form, and CONSENT_VERSION of the wording shown next to it.
  source TEXT NOT NULL,
  consent_text_version TEXT NOT NULL,
  -- Salted SHA-256 of the signup IP (null when IP_HASH_SALT is not configured).
  ip_hash TEXT,
  confirm_token_hash TEXT UNIQUE,
  confirm_token_expires_at INTEGER,
  confirm_sent_at INTEGER,
  confirm_send_count INTEGER NOT NULL DEFAULT 0,
  confirmed_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Daily purge of never-confirmed sign-ups.
CREATE INDEX early_access_status_created_idx ON early_access_signups (status, created_at);
-- Per-IP sign-up limit.
CREATE INDEX early_access_ip_created_idx ON early_access_signups (ip_hash, created_at);
