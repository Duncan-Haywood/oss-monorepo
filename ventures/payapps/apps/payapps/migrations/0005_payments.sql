CREATE TABLE `pay_app_payments` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`pay_app_id` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`received_on` text NOT NULL,
	`reference` text,
	`created_by` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`pay_app_id`) REFERENCES `pay_apps`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `pay_app_payments_app_idx` ON `pay_app_payments` (`org_id`,`pay_app_id`);