CREATE TABLE `admin_audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_type` text NOT NULL,
	`actor_id` text NOT NULL,
	`action` text NOT NULL,
	`metadata` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `admin_audit_log_created_idx` ON `admin_audit_log` (`created_at`);--> statement-breakpoint
ALTER TABLE `subscriptions` ADD `price_amount_minor` integer;--> statement-breakpoint
ALTER TABLE `subscriptions` ADD `price_currency` text;--> statement-breakpoint
ALTER TABLE `subscriptions` ADD `billing_interval` text;--> statement-breakpoint
ALTER TABLE `subscriptions` ADD `billing_frequency` integer;--> statement-breakpoint
ALTER TABLE `subscriptions` ADD `price_quantity` integer;--> statement-breakpoint
ALTER TABLE `subscriptions` ADD `price_discounted` integer;--> statement-breakpoint
ALTER TABLE `subscriptions` ADD `trial_started_at` integer;--> statement-breakpoint
ALTER TABLE `subscriptions` ADD `first_paid_at` integer;--> statement-breakpoint
ALTER TABLE `subscriptions` ADD `canceled_at` integer;