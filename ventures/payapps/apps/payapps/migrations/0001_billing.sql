CREATE TABLE `billing_events` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`provider_event_id` text NOT NULL,
	`type` text NOT NULL,
	`org_id` text,
	`outcome` text,
	`reason` text,
	`processed_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `billing_events_provider_event_idx` ON `billing_events` (`provider`,`provider_event_id`);--> statement-breakpoint
CREATE TABLE `pending_checkouts` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`plan_key` text NOT NULL,
	`interval` text NOT NULL,
	`created_by` text,
	`expires_at` integer NOT NULL,
	`consumed_at` integer,
	`provider_subscription_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `pending_checkouts_org_idx` ON `pending_checkouts` (`org_id`);--> statement-breakpoint
CREATE TABLE `subscriptions` (
	`org_id` text PRIMARY KEY NOT NULL,
	`plan_key` text NOT NULL,
	`status` text NOT NULL,
	`provider` text,
	`provider_customer_id` text,
	`provider_subscription_id` text,
	`current_period_start` integer,
	`current_period_end` integer,
	`cancel_at_period_end` integer DEFAULT false NOT NULL,
	`provider_updated_at` integer,
	`past_due_since` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `subscriptions_provider_sub_idx` ON `subscriptions` (`provider_subscription_id`);