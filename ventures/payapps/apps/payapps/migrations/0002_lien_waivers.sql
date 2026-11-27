CREATE TABLE `lien_waivers` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`project_id` text NOT NULL,
	`pay_app_id` text NOT NULL,
	`state` text NOT NULL,
	`kind` text NOT NULL,
	`form_id` text,
	`amount_cents` integer NOT NULL,
	`through_date` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`sent_at` integer,
	`form_data` text,
	`created_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`pay_app_id`) REFERENCES `pay_apps`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `lien_waivers_pay_app_idx` ON `lien_waivers` (`org_id`,`pay_app_id`);