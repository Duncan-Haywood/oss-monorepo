CREATE TABLE `machine_capacity` (
	`org_id` text NOT NULL,
	`machine_id` text NOT NULL,
	`hours_per_day` real NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`org_id`, `machine_id`),
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`machine_id`) REFERENCES `machines`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `quote_jobs` (
	`quote_id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`due_on` text,
	`quantities` text DEFAULT '{}' NOT NULL,
	`shipped_on` text,
	`updated_by` text,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`quote_id`) REFERENCES `quotes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`updated_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
