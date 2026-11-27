CREATE TABLE `submittals` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`project_id` text NOT NULL,
	`number` integer NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`spec_section` text,
	`title` text NOT NULL,
	`type` text NOT NULL,
	`gc_reference` text,
	`submitted_on` text,
	`required_by` text,
	`returned_on` text,
	`action` text,
	`needed_on_site` text,
	`lead_time_days` integer,
	`review_days` integer,
	`notes` text,
	`created_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `submittals_project_idx` ON `submittals` (`org_id`,`project_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `submittals_number_revision_idx` ON `submittals` (`project_id`,`number`,`revision`);