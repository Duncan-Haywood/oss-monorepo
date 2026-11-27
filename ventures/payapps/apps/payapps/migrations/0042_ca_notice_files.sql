CREATE TABLE `lien_notice_files` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`project_id` text NOT NULL,
	`send_id` text NOT NULL,
	`r2_key` text NOT NULL,
	`file_name` text NOT NULL,
	`content_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`category` text DEFAULT 'backup' NOT NULL,
	`created_by` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`send_id`) REFERENCES `lien_notice_sends`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `lien_notice_files_send_idx` ON `lien_notice_files` (`org_id`,`send_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `lien_notice_files_key_uq` ON `lien_notice_files` (`r2_key`);