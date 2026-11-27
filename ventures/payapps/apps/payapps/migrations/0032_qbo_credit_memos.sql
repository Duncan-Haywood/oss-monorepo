CREATE TABLE `qbo_credit_memo_syncs` (
	`pay_app_id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`realm_id` text NOT NULL,
	`invoice_id` text NOT NULL,
	`credit_memo_id` text,
	`doc_number` text,
	`amount_cents` integer NOT NULL,
	`applied` integer DEFAULT true NOT NULL,
	`synced_by` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`pay_app_id`) REFERENCES `pay_apps`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`synced_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `qbo_credit_memo_syncs_org_idx` ON `qbo_credit_memo_syncs` (`org_id`);