CREATE TABLE `home_office` (
	`org_id` text NOT NULL,
	`year` integer NOT NULL,
	`office_sqft` integer NOT NULL,
	`home_sqft` integer,
	`months_mask` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `home_office_org_year_idx` ON `home_office` (`org_id`,`year`);