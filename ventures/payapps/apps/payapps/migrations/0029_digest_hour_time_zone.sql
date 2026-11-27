ALTER TABLE `cash_digest_subscriptions` ADD `hour` integer DEFAULT 13 NOT NULL;--> statement-breakpoint
ALTER TABLE `cash_digest_subscriptions` ADD `time_zone` text DEFAULT 'UTC' NOT NULL;