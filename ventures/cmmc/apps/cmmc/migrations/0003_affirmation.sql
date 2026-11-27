CREATE TABLE `affirmation` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`level` integer NOT NULL,
	`kind` text NOT NULL,
	`cmmc_status` text NOT NULL,
	`cmmc_status_date` text NOT NULL,
	`affirmed_on` text NOT NULL,
	`official_name` text NOT NULL,
	`official_title` text NOT NULL,
	`official_contact` text NOT NULL,
	`sprs_score` integer,
	`workspace_score` integer,
	`notes` text DEFAULT '' NOT NULL,
	`recorded_by` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`recorded_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `affirmation_org_idx` ON `affirmation` (`org_id`,`level`,`affirmed_on`);