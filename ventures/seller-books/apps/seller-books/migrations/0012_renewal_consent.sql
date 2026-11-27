CREATE TABLE `renewal_consent` (
	`checkout_id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`provider_subscription_id` text NOT NULL,
	`provider_customer_id` text,
	`plan_key` text NOT NULL,
	`interval` text NOT NULL,
	`terms_version` text NOT NULL,
	`consented_at` integer NOT NULL,
	`subscribed_at` integer NOT NULL,
	`ended_at` integer,
	`keep_until` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `renewal_consent_sub_idx` ON `renewal_consent` (`provider_subscription_id`);--> statement-breakpoint
CREATE INDEX `renewal_consent_org_idx` ON `renewal_consent` (`org_id`);--> statement-breakpoint
-- Backfill: checkouts already turned into subscriptions with a recorded consent (from 2026-11-27).
INSERT OR IGNORE INTO `renewal_consent` (`checkout_id`, `org_id`, `provider_subscription_id`, `provider_customer_id`, `plan_key`, `interval`, `terms_version`, `consented_at`, `subscribed_at`, `created_at`)
SELECT p.`id`, p.`org_id`, p.`provider_subscription_id`, s.`provider_customer_id`, p.`plan_key`, p.`interval`, p.`renewal_terms_version`, p.`renewal_consent_at`, p.`consumed_at`, p.`consumed_at`
FROM `pending_checkouts` p LEFT JOIN `subscriptions` s ON s.`provider_subscription_id` = p.`provider_subscription_id`
WHERE p.`consumed_at` IS NOT NULL AND p.`provider_subscription_id` IS NOT NULL AND p.`renewal_terms_version` IS NOT NULL AND p.`renewal_consent_at` IS NOT NULL;
