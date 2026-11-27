-- Early-access sign-ups (double opt-in). Public prospects, not tenant data.
-- Privacy: no IP address is stored; tokens are stored only as SHA-256 hashes.
CREATE TABLE early_access_signups (
  id TEXT PRIMARY KEY NOT NULL,
  email TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('pending', 'confirmed')),
  company TEXT,
  role TEXT,
  jobs TEXT,
  tool TEXT,
  message TEXT,
  source TEXT NOT NULL,
  consent_version TEXT NOT NULL,
  confirm_token_hash TEXT UNIQUE,
  confirm_expires_at INTEGER,
  confirm_sent_at INTEGER,
  confirm_send_count INTEGER NOT NULL DEFAULT 0,
  remove_token_hash TEXT UNIQUE,
  created_at INTEGER NOT NULL,
  confirmed_at INTEGER,
  updated_at INTEGER NOT NULL
);

CREATE INDEX early_access_signups_status_created ON early_access_signups (status, created_at);
