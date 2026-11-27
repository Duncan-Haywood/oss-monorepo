CREATE TABLE `person` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`name` text NOT NULL,
	`job_title` text DEFAULT '' NOT NULL,
	`email` text DEFAULT '' NOT NULL,
	`cui_access` integer DEFAULT true NOT NULL,
	`security_duties` integer DEFAULT false NOT NULL,
	`duties_description` text DEFAULT '' NOT NULL,
	`screened_on` text,
	`screening_method` text DEFAULT '' NOT NULL,
	`access_granted_on` text,
	`awareness_on` text,
	`role_based_on` text,
	`insider_threat_on` text,
	`left_on` text,
	`departure_kind` text,
	`access_removed_on` text,
	`notes` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `person_org_name_idx` ON `person` (`org_id`,`name`);--> statement-breakpoint
ALTER TABLE `org_profile` ADD `training_refresh_months` integer DEFAULT 12 NOT NULL;