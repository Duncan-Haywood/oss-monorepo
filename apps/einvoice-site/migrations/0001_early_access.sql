-- Early-access signups (double opt-in). Exactly the fields the privacy pages list; no IP address.
-- Times are epoch milliseconds.
CREATE TABLE early_access (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,            -- trimmed, lowercased
  lang TEXT NOT NULL CHECK (lang IN ('de', 'fr', 'en')),
  role TEXT NOT NULL CHECK (role IN ('accountant', 'vendor', 'business', 'other')),
  countries TEXT NOT NULL DEFAULT '',    -- comma-separated country keys, e.g. "de,fr"
  consent_version TEXT NOT NULL,         -- CONSENT_VERSION of the wording shown
  consent_at INTEGER NOT NULL,           -- last form submission
  status TEXT NOT NULL CHECK (status IN ('pending', 'confirmed')),
  token_hash TEXT,                       -- SHA-256 of the confirmation token; NULL once confirmed
  token_expires_at INTEGER,
  confirm_sent_at INTEGER,
  confirm_send_count INTEGER NOT NULL DEFAULT 0,
  send_window_start INTEGER,             -- start of the rolling day for the resend limit
  confirmed_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX early_access_token_hash ON early_access (token_hash);
CREATE INDEX early_access_status_consent ON early_access (status, consent_at);
CREATE INDEX early_access_status_confirmed ON early_access (status, confirmed_at);
