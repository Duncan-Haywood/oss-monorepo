CREATE TABLE `sworn_statements_given` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`org_id` text NOT NULL,
	`pay_app` text NOT NULL,
	`statement_date` text NOT NULL,
	`state` text NOT NULL,
	`data` text NOT NULL,
	`created_by` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sworn_given_project_app_date_uq` ON `sworn_statements_given` (`project_id`,`pay_app`,`statement_date`);--> statement-breakpoint
CREATE INDEX `sworn_given_org_idx` ON `sworn_statements_given` (`org_id`);