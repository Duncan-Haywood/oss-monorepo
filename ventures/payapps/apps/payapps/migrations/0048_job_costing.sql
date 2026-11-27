CREATE TABLE `job_cost_budgets` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`project_id` text NOT NULL,
	`sov_line_id` text NOT NULL,
	`budget_cents` integer NOT NULL,
	`updated_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`sov_line_id`) REFERENCES `sov_lines`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`updated_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `job_cost_budgets_line_uq` ON `job_cost_budgets` (`sov_line_id`);--> statement-breakpoint
CREATE INDEX `job_cost_budgets_org_idx` ON `job_cost_budgets` (`org_id`,`project_id`);--> statement-breakpoint
CREATE TABLE `job_cost_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`project_id` text NOT NULL,
	`sov_line_id` text,
	`incurred_on` text NOT NULL,
	`category` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`vendor` text,
	`description` text,
	`reference` text,
	`created_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`sov_line_id`) REFERENCES `sov_lines`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `job_cost_entries_project_idx` ON `job_cost_entries` (`org_id`,`project_id`,`incurred_on`);