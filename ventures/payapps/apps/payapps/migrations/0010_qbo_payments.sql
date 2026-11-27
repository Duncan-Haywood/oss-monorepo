CREATE TABLE `qbo_payment_syncs` (
	`payment_id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`pay_app_id` text NOT NULL,
	`realm_id` text NOT NULL,
	`invoice_id` text NOT NULL,
	`qbo_payment_id` text,
	`amount_cents` integer NOT NULL,
	`synced_by` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`payment_id`) REFERENCES `pay_app_payments`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`pay_app_id`) REFERENCES `pay_apps`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`synced_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `qbo_payment_syncs_app_idx` ON `qbo_payment_syncs` (`org_id`,`pay_app_id`);