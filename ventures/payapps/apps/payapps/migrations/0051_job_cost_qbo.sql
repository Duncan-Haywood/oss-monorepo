CREATE TABLE `job_cost_qbo_links` (
	`project_id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`realm_id` text NOT NULL,
	`customer_id` text NOT NULL,
	`customer_name` text NOT NULL,
	`updated_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`updated_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `job_cost_qbo_links_org_idx` ON `job_cost_qbo_links` (`org_id`);--> statement-breakpoint
ALTER TABLE `job_cost_entries` ADD `qbo_source` text;--> statement-breakpoint
CREATE UNIQUE INDEX `job_cost_entries_qbo_source_idx` ON `job_cost_entries` (`org_id`,`qbo_source`);