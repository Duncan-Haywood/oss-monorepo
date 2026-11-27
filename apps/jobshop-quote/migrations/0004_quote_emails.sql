CREATE TABLE `quote_emails` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`quote_id` text NOT NULL,
	`sent_by` text,
	`to_addresses` text NOT NULL,
	`reply_to` text NOT NULL,
	`subject` text NOT NULL,
	`pdf_sha256` text NOT NULL,
	`status` text NOT NULL,
	`delivered` integer DEFAULT false NOT NULL,
	`provider_message_id` text,
	`error` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`quote_id`) REFERENCES `quotes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`sent_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `quote_emails_quote_idx` ON `quote_emails` (`org_id`,`quote_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `quote_emails_org_idx` ON `quote_emails` (`org_id`,`created_at`);