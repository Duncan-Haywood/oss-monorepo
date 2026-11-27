CREATE TABLE `qbo_connections` (
	`org_id` text PRIMARY KEY NOT NULL,
	`realm_id` text NOT NULL,
	`environment` text NOT NULL,
	`tokens_enc` text NOT NULL,
	`refresh_expires_at` integer NOT NULL,
	`connected_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`connected_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `qbo_invoice_syncs` (
	`pay_app_id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`project_id` text NOT NULL,
	`realm_id` text NOT NULL,
	`invoice_id` text NOT NULL,
	`doc_number` text NOT NULL,
	`total_cents` integer NOT NULL,
	`line_count` integer NOT NULL,
	`synced_by` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`pay_app_id`) REFERENCES `pay_apps`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`synced_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `qbo_invoice_syncs_org_idx` ON `qbo_invoice_syncs` (`org_id`,`project_id`);--> statement-breakpoint
CREATE TABLE `qbo_oauth_states` (
	`state_hash` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `qbo_oauth_states_org_idx` ON `qbo_oauth_states` (`org_id`);