CREATE TABLE `estimate_reminder` (
	`org_id` text NOT NULL,
	`user_id` text NOT NULL,
	`last_sent_due` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `estimate_reminder_org_user_idx` ON `estimate_reminder` (`org_id`,`user_id`);