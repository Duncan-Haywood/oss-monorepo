CREATE TABLE `project_insurance_requirements` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`project_id` text NOT NULL,
	`kind` text NOT NULL,
	`each_occurrence_cents` integer,
	`aggregate_cents` integer,
	`additional_insured` integer DEFAULT false NOT NULL,
	`waiver_of_subrogation` integer DEFAULT false NOT NULL,
	`primary_noncontributory` integer DEFAULT false NOT NULL,
	`umbrella_counts` integer DEFAULT false NOT NULL,
	`created_by` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `project_insurance_requirements_uq` ON `project_insurance_requirements` (`project_id`,`kind`);--> statement-breakpoint
CREATE INDEX `project_insurance_requirements_org_idx` ON `project_insurance_requirements` (`org_id`,`project_id`);--> statement-breakpoint
ALTER TABLE `insurance_certificates` ADD `each_occurrence_cents` integer;--> statement-breakpoint
ALTER TABLE `insurance_certificates` ADD `aggregate_cents` integer;--> statement-breakpoint
ALTER TABLE `insurance_certificates` ADD `additional_insured` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `insurance_certificates` ADD `waiver_of_subrogation` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `insurance_certificates` ADD `primary_noncontributory` integer DEFAULT false NOT NULL;