CREATE TABLE `lower_tier_waivers` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`project_id` text NOT NULL,
	`pay_app_id` text NOT NULL,
	`party` text NOT NULL,
	`party_kind` text,
	`kind` text NOT NULL,
	`through_date` text,
	`amount_cents` integer,
	`requested_on` text,
	`received_on` text,
	`note` text,
	`created_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`pay_app_id`) REFERENCES `pay_apps`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `lower_tier_waivers_pay_app_idx` ON `lower_tier_waivers` (`org_id`,`pay_app_id`);--> statement-breakpoint
CREATE INDEX `lower_tier_waivers_project_idx` ON `lower_tier_waivers` (`org_id`,`project_id`);