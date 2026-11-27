CREATE TABLE `rfis` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`project_id` text NOT NULL,
	`number` integer NOT NULL,
	`subject` text NOT NULL,
	`question` text NOT NULL,
	`suggestion` text,
	`reference` text,
	`sent_on` text,
	`response_due_on` text,
	`answered_on` text,
	`answer` text,
	`answered_by` text,
	`cost_impact` text,
	`time_impact` text,
	`change_order_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`change_order_id`) REFERENCES `change_orders`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `rfis_project_idx` ON `rfis` (`org_id`,`project_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `rfis_number_uq` ON `rfis` (`project_id`,`number`);