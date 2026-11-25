-- Hosted team hubs (aws/app.mjs). One row per team; the state is what server.mjs keeps in its JSON file.
-- Applied as app_roster_hub by the starter's migrate step on every deploy (idempotent per file).

CREATE TABLE IF NOT EXISTS hub_teams (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- built into Postgres 13+, no extension
  owner_sub   text NOT NULL,                 -- the manager's Cognito sub
  name        text NOT NULL,
  admin_hash  text NOT NULL UNIQUE,          -- SHA-256 hex of the admin key; the key itself is never stored
  team_hash   text NOT NULL UNIQUE,          -- SHA-256 hex of the team token
  state       jsonb NOT NULL,
  settings    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (admin_hash ~ '^[0-9a-f]{64}$' AND team_hash ~ '^[0-9a-f]{64}$')
);
CREATE INDEX IF NOT EXISTS hub_teams_owner ON hub_teams (owner_sub);
