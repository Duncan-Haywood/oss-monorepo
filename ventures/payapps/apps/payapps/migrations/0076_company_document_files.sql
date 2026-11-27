CREATE TABLE `company_document_files` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`document_id` text NOT NULL,
	`r2_key` text NOT NULL,
	`file_name` text NOT NULL,
	`content_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`category` text DEFAULT 'backup' NOT NULL,
	`created_by` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`document_id`) REFERENCES `company_documents`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `company_document_files_doc_idx` ON `company_document_files` (`org_id`,`document_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `company_document_files_key_uq` ON `company_document_files` (`r2_key`);