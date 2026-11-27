CREATE TABLE `fl_notice_sends` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`project_id` text NOT NULL,
	`recipient` text NOT NULL,
	`recipient_name_address` text NOT NULL,
	`method` text NOT NULL,
	`sent_on` text NOT NULL,
	`delivered_on` text,
	`tracking` text,
	`created_by` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `fl_notice_sends_project_idx` ON `fl_notice_sends` (`org_id`,`project_id`);--> statement-breakpoint
ALTER TABLE `projects` ADD `fl_first_furnished_on` text;