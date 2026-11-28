CREATE TABLE `gauge` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`tag` text NOT NULL,
	`description` text NOT NULL,
	`kind` text NOT NULL,
	`manufacturer` text DEFAULT '' NOT NULL,
	`serial` text DEFAULT '' NOT NULL,
	`range` text DEFAULT '' NOT NULL,
	`location` text DEFAULT '' NOT NULL,
	`owner` text DEFAULT 'company' NOT NULL,
	`assigned_to` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`interval_months` integer,
	`method` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `gauge_org_tag_uq` ON `gauge` (`org_id`,`tag`);--> statement-breakpoint
CREATE TABLE `gauge_calibration` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`gauge_id` text NOT NULL,
	`calibrated_on` text NOT NULL,
	`performer` text NOT NULL,
	`performed_by` text NOT NULL,
	`as_found` text NOT NULL,
	`as_left` text NOT NULL,
	`readings` text DEFAULT '' NOT NULL,
	`certificate_no` text DEFAULT '' NOT NULL,
	`traceability` text DEFAULT '' NOT NULL,
	`interval_months` integer,
	`due_on` text,
	`evidence_id` text,
	`file_name` text,
	`file_sha256` text,
	`impact` text DEFAULT '' NOT NULL,
	`impact_on` text,
	`corrective_action_ref` text DEFAULT '' NOT NULL,
	`recorded_by` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`gauge_id`) REFERENCES `gauge`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`evidence_id`) REFERENCES `evidence`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`recorded_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `gauge_calibration_gauge_idx` ON `gauge_calibration` (`org_id`,`gauge_id`,`calibrated_on`);