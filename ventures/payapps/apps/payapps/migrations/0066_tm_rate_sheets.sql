CREATE TABLE `tm_rate_sheets` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`project_id` text NOT NULL,
	`labor` text NOT NULL,
	`material` text NOT NULL,
	`equipment` text NOT NULL,
	`labor_markup_bps` integer,
	`material_markup_bps` integer,
	`equipment_markup_bps` integer,
	`source` text,
	`updated_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`updated_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tm_rate_sheets_project_uq` ON `tm_rate_sheets` (`org_id`,`project_id`);