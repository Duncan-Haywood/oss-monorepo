-- Platform schema: one copy per product database. Applied by `node src/migrate.mjs`
-- (idempotent). Products add their own tables in their own migrations.

CREATE SCHEMA IF NOT EXISTS platform;

-- Every verified Paddle notification, once. The primary key makes a redelivery a no-op.
CREATE TABLE IF NOT EXISTS platform.paddle_events (
  event_id     text PRIMARY KEY,
  event_type   text NOT NULL,
  occurred_at  timestamptz NOT NULL,
  received_at  timestamptz NOT NULL DEFAULT now(),
  payload      jsonb NOT NULL
);

-- What the app reads: one row per (product, user). Written only by the entitlement consumer.
CREATE TABLE IF NOT EXISTS platform.entitlements (
  product              text NOT NULL,
  user_sub             text NOT NULL,          -- Cognito `sub`, passed to checkout as customData.user_sub
  status               text NOT NULL,          -- Paddle subscription status
  plan                 text,                   -- Paddle price id of the first item
  subscription_id      text NOT NULL,
  customer_id          text,
  current_period_end   timestamptz,
  source_occurred_at   timestamptz NOT NULL,   -- newest Paddle event applied; older ones are ignored
  updated_at           timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (product, user_sub)
);

-- Native-app devices registered for SNS mobile push.
CREATE TABLE IF NOT EXISTS platform.push_devices (
  user_sub      text NOT NULL,
  platform      text NOT NULL CHECK (platform IN ('apns', 'apns_sandbox', 'fcm')),
  device_token  text NOT NULL,
  endpoint_arn  text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (platform, device_token)
);
CREATE INDEX IF NOT EXISTS push_devices_user ON platform.push_devices (user_sub);
