CREATE TABLE `quote_follow_ups` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`quote_id` text NOT NULL,
	`by_user_id` text,
	`note` text,
	`next_on` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`quote_id`) REFERENCES `quotes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `quote_follow_ups_quote_idx` ON `quote_follow_ups` (`org_id`,`quote_id`);--> statement-breakpoint
ALTER TABLE `quotes` ADD `follow_up_on` text;--> statement-breakpoint
ALTER TABLE `quotes` ADD `follow_up_reminded_for` text;--> statement-breakpoint
CREATE INDEX `quotes_status_follow_up_idx` ON `quotes` (`status`,`follow_up_on`);--> statement-breakpoint
ALTER TABLE `member_notifications` ADD `quote_follow_up` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `shop_settings` ADD `follow_up_days` integer DEFAULT 3 NOT NULL;