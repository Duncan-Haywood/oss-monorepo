CREATE TABLE `estimate_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`estimate_id` text NOT NULL,
	`sort_order` integer NOT NULL,
	`bid_item` text NOT NULL,
	`category` text NOT NULL,
	`description` text NOT NULL,
	`quantity_milli` integer NOT NULL,
	`unit` text,
	`unit_cost_micros` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`estimate_id`) REFERENCES `estimates`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `estimate_lines_estimate_idx` ON `estimate_lines` (`org_id`,`estimate_id`,`sort_order`);--> statement-breakpoint
CREATE TABLE `estimates` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`number` integer NOT NULL,
	`name` text NOT NULL,
	`gc_name` text NOT NULL,
	`gc_contact_name` text,
	`gc_contact_email` text,
	`location` text,
	`bid_due_on` text,
	`sent_on` text,
	`decided_on` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`valid_days` integer DEFAULT 30 NOT NULL,
	`labor_markup_bps` integer DEFAULT 0 NOT NULL,
	`material_markup_bps` integer DEFAULT 0 NOT NULL,
	`equipment_markup_bps` integer DEFAULT 0 NOT NULL,
	`subcontract_markup_bps` integer DEFAULT 0 NOT NULL,
	`other_markup_bps` integer DEFAULT 0 NOT NULL,
	`material_tax_bps` integer DEFAULT 0 NOT NULL,
	`inclusions` text,
	`exclusions` text,
	`notes` text,
	`project_id` text,
	`created_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `estimates_org_idx` ON `estimates` (`org_id`,`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `estimates_number_uq` ON `estimates` (`org_id`,`number`);