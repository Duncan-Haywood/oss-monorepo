CREATE TABLE `company_holidays` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`on_date` text NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `company_holidays_date_uq` ON `company_holidays` (`org_id`,`on_date`);