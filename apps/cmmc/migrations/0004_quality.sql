CREATE TABLE `quality_clause_record` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`clause_id` text NOT NULL,
	`status` text DEFAULT 'not_assessed' NOT NULL,
	`owner_user_id` text,
	`notes` text DEFAULT '' NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`owner_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `quality_clause_org_clause_uq` ON `quality_clause_record` (`org_id`,`clause_id`);--> statement-breakpoint
CREATE TABLE `quality_evidence_link` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`clause_id` text NOT NULL,
	`evidence_id` text NOT NULL,
	`linked_by` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`evidence_id`) REFERENCES `evidence`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`linked_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `quality_link_org_clause_evidence_uq` ON `quality_evidence_link` (`org_id`,`clause_id`,`evidence_id`);