CREATE TABLE `insurance_certificate_projects` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`certificate_id` text NOT NULL,
	`project_id` text NOT NULL,
	`sent_on` text,
	`created_by` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`certificate_id`) REFERENCES `insurance_certificates`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `insurance_certificate_projects_uq` ON `insurance_certificate_projects` (`certificate_id`,`project_id`);--> statement-breakpoint
CREATE INDEX `insurance_certificate_projects_org_idx` ON `insurance_certificate_projects` (`org_id`,`project_id`);