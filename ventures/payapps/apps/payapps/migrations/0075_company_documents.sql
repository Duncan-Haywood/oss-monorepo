CREATE TABLE `company_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`kind` text NOT NULL,
	`label` text,
	`issuer` text,
	`jurisdiction` text,
	`classification` text,
	`number` text,
	`effective_on` text,
	`expires_on` text,
	`notes` text,
	`archived` integer DEFAULT false NOT NULL,
	`created_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `company_documents_org_idx` ON `company_documents` (`org_id`,`expires_on`);