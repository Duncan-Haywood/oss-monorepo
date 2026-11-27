CREATE TABLE `insurance_certificate_files` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`certificate_id` text NOT NULL,
	`r2_key` text NOT NULL,
	`file_name` text NOT NULL,
	`content_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`category` text DEFAULT 'backup' NOT NULL,
	`created_by` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`certificate_id`) REFERENCES `insurance_certificates`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `insurance_certificate_files_cert_idx` ON `insurance_certificate_files` (`org_id`,`certificate_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `insurance_certificate_files_key_uq` ON `insurance_certificate_files` (`r2_key`);