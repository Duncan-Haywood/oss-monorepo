CREATE TABLE `daily_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`project_id` text NOT NULL,
	`report_date` text NOT NULL,
	`weather` text,
	`temp_high_f` integer,
	`temp_low_f` integer,
	`delay_hours` real,
	`crew` text NOT NULL,
	`work_performed` text,
	`delays` text,
	`equipment` text,
	`deliveries` text,
	`visitors` text,
	`safety` text,
	`notes` text,
	`created_by` text,
	`updated_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`updated_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `daily_reports_project_idx` ON `daily_reports` (`org_id`,`project_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `daily_reports_day_uq` ON `daily_reports` (`project_id`,`report_date`);