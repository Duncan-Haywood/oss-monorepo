CREATE TABLE `filed_inventory` (
	`org_id` text NOT NULL,
	`year` integer NOT NULL,
	`closing_cents` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `filed_inventory_org_year_idx` ON `filed_inventory` (`org_id`,`year`);