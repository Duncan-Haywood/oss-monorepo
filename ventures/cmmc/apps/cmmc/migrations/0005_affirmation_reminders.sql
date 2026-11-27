CREATE TABLE `affirmation_reminder_sent` (
	`org_id` text NOT NULL,
	`level` integer NOT NULL,
	`deadline_key` text NOT NULL,
	`due` text NOT NULL,
	`stage` integer NOT NULL,
	`sent_at` integer NOT NULL,
	PRIMARY KEY(`org_id`, `level`, `deadline_key`, `due`, `stage`),
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `member_notifications` (
	`org_id` text NOT NULL,
	`user_id` text NOT NULL,
	`affirmation_reminders` integer DEFAULT true NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`org_id`, `user_id`),
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
