CREATE TABLE `routings` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`name` text NOT NULL,
	`name_key` text NOT NULL,
	`part_family` text,
	`operations` text NOT NULL,
	`finishing` text NOT NULL,
	`created_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `routings_org_name_uq` ON `routings` (`org_id`,`name_key`);--> statement-breakpoint
CREATE INDEX `routings_org_idx` ON `routings` (`org_id`);