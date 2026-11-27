CREATE TABLE `schedule_activities` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`project_id` text NOT NULL,
	`number` integer NOT NULL,
	`name` text NOT NULL,
	`trade` text,
	`start_on` text NOT NULL,
	`finish_on` text NOT NULL,
	`percent_complete` integer DEFAULT 0 NOT NULL,
	`predecessor_number` integer,
	`lag_days` integer DEFAULT 0 NOT NULL,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `schedule_activities_project_idx` ON `schedule_activities` (`org_id`,`project_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `schedule_activities_number_uq` ON `schedule_activities` (`project_id`,`number`);