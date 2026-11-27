CREATE TABLE `insurance_certificates` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`kind` text NOT NULL,
	`label` text,
	`carrier` text,
	`policy_number` text,
	`effective_on` text,
	`expires_on` text NOT NULL,
	`notes` text,
	`archived` integer DEFAULT false NOT NULL,
	`created_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `insurance_certificates_org_idx` ON `insurance_certificates` (`org_id`,`expires_on`);