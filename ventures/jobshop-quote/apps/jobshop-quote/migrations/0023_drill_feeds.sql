CREATE TABLE `drill_feeds` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`machine_id` text NOT NULL,
	`material_id` text NOT NULL,
	`drill_feed_in_per_min` real NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`machine_id`) REFERENCES `machines`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`material_id`) REFERENCES `materials`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `drill_feeds_org_idx` ON `drill_feeds` (`org_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `drill_feeds_machine_material_uq` ON `drill_feeds` (`machine_id`,`material_id`);