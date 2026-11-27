CREATE TABLE `pay_app_events` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`project_id` text NOT NULL,
	`pay_app_id` text NOT NULL,
	`pay_app_number` integer NOT NULL,
	`action` text NOT NULL,
	`data` text,
	`actor_user_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `pay_app_events_app_idx` ON `pay_app_events` (`org_id`,`pay_app_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `pay_app_events_project_idx` ON `pay_app_events` (`org_id`,`project_id`,`created_at`);