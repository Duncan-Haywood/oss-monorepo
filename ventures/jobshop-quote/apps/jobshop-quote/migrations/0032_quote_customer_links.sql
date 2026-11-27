CREATE TABLE `quote_links` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`quote_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`quote_email_id` text,
	`created_by` text,
	`created_at` integer NOT NULL,
	`last_viewed_at` integer,
	`revoked_at` integer,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`quote_id`) REFERENCES `quotes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`quote_email_id`) REFERENCES `quote_emails`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `quote_links_token_uq` ON `quote_links` (`token_hash`);--> statement-breakpoint
CREATE INDEX `quote_links_quote_idx` ON `quote_links` (`org_id`,`quote_id`);--> statement-breakpoint
CREATE TABLE `quote_responses` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`quote_id` text NOT NULL,
	`link_id` text,
	`decision` text NOT NULL,
	`name` text NOT NULL,
	`email` text,
	`po_number` text,
	`choices` text NOT NULL,
	`amount_cents` integer,
	`note` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`quote_id`) REFERENCES `quotes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`link_id`) REFERENCES `quote_links`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `quote_responses_quote_uq` ON `quote_responses` (`org_id`,`quote_id`);