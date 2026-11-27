CREATE TABLE `asset` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`specialized_type` text,
	`asset_type` text DEFAULT '' NOT NULL,
	`location` text DEFAULT '' NOT NULL,
	`provider` text DEFAULT '' NOT NULL,
	`owner` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `asset_org_category_idx` ON `asset` (`org_id`,`category`);