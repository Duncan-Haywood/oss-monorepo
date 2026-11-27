CREATE TABLE `cut_speeds` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`machine_id` text NOT NULL,
	`material_id` text NOT NULL,
	`cut_speed_in_per_min` real NOT NULL,
	`pierce_seconds` real,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`machine_id`) REFERENCES `machines`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`material_id`) REFERENCES `materials`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `cut_speeds_org_idx` ON `cut_speeds` (`org_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `cut_speeds_machine_material_uq` ON `cut_speeds` (`machine_id`,`material_id`);