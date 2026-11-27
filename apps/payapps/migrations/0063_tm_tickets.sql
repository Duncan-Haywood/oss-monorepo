CREATE TABLE `tm_tickets` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`project_id` text NOT NULL,
	`number` integer NOT NULL,
	`work_date` text NOT NULL,
	`description` text NOT NULL,
	`location` text,
	`directed_by` text,
	`reference` text,
	`labor` text NOT NULL,
	`material` text NOT NULL,
	`equipment` text NOT NULL,
	`labor_markup_bps` integer DEFAULT 0 NOT NULL,
	`material_markup_bps` integer DEFAULT 0 NOT NULL,
	`equipment_markup_bps` integer DEFAULT 0 NOT NULL,
	`notes` text,
	`signed_name` text,
	`signed_title` text,
	`signed_on` text,
	`signature_jpeg` text,
	`change_order_id` text,
	`created_by` text,
	`updated_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`change_order_id`) REFERENCES `change_orders`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`updated_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `tm_tickets_project_idx` ON `tm_tickets` (`org_id`,`project_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `tm_tickets_number_uq` ON `tm_tickets` (`project_id`,`number`);--> statement-breakpoint
CREATE INDEX `tm_tickets_change_order_idx` ON `tm_tickets` (`change_order_id`);