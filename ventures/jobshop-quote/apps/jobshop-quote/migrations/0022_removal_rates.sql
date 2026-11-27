CREATE TABLE `removal_rates` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`machine_id` text NOT NULL,
	`material_id` text NOT NULL,
	`removal_rate_in3_per_min` real NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`machine_id`) REFERENCES `machines`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`material_id`) REFERENCES `materials`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `removal_rates_org_idx` ON `removal_rates` (`org_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `removal_rates_machine_material_uq` ON `removal_rates` (`machine_id`,`material_id`);