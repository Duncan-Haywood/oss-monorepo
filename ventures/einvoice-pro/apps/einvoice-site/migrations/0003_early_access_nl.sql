-- Dutch pages (content/i18n/nl.mjs): the lang column's CHECK gains 'nl'. SQLite cannot alter a
-- CHECK constraint, so the table is rebuilt with the same columns and indexes and every row copied.
CREATE TABLE early_access_new (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,            -- trimmed, lowercased
  lang TEXT NOT NULL CHECK (lang IN ('de', 'fr', 'en', 'nl')),
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
INSERT INTO early_access_new (id, email, lang, role, countries, consent_version, consent_at, status,
  token_hash, token_expires_at, confirm_sent_at, confirm_send_count, send_window_start, confirmed_at,
  created_at)
SELECT id, email, lang, role, countries, consent_version, consent_at, status, token_hash,
  token_expires_at, confirm_sent_at, confirm_send_count, send_window_start, confirmed_at, created_at
FROM early_access;
DROP TABLE early_access;
ALTER TABLE early_access_new RENAME TO early_access;
CREATE UNIQUE INDEX early_access_token_hash ON early_access (token_hash);
CREATE INDEX early_access_status_consent ON early_access (status, consent_at);
CREATE INDEX early_access_status_confirmed ON early_access (status, confirmed_at);
