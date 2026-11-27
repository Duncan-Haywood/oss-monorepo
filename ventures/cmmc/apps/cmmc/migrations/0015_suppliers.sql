CREATE TABLE `supplier` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`name` text NOT NULL,
	`supplies` text DEFAULT '' NOT NULL,
	`info_flowed` text NOT NULL,
	`cots` integer DEFAULT false NOT NULL,
	`required_level` text,
	`status` text,
	`status_date` text,
	`affirmed_on` text,
	`cmmc_uids` text DEFAULT '' NOT NULL,
	`clause_flowed_down` integer DEFAULT false NOT NULL,
	`subcontract_ref` text DEFAULT '' NOT NULL,
	`checked_on` text,
	`awarded_on` text,
	`evidence_ref` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `supplier_org_idx` ON `supplier` (`org_id`);