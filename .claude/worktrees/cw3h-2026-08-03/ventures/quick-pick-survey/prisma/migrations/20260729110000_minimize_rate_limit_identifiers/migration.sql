-- Existing rows contain raw IP addresses and cannot be converted to the new
-- server-keyed HMAC without exposing the secret to SQL. These tables contain
-- only short-lived abuse-control events, so discard them during deployment.
-- New rows are keyed digests and are pruned by the application.
DELETE FROM "AnonRequestLog";
DELETE FROM "LoginAttempt";
DELETE FROM "AdminLoginAttempt";
