CREATE TABLE `punch_items` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`project_id` text NOT NULL,
	`number` integer NOT NULL,
	`description` text NOT NULL,
	`location` text,
	`source` text,
	`listed_on` text,
	`due_on` text,
	`completed_on` text,
	`completed_by` text,
	`accepted_on` text,
	`accepted_by` text,
	`dispute_note` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `punch_items_project_idx` ON `punch_items` (`org_id`,`project_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `punch_items_number_uq` ON `punch_items` (`project_id`,`number`);