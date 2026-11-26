DROP INDEX `quotes_org_number_uq`;--> statement-breakpoint
ALTER TABLE `quotes` ADD `rev_number` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `quotes` ADD `supersedes_quote_id` text REFERENCES quotes(id) ON DELETE set null;--> statement-breakpoint
ALTER TABLE `quotes` ADD `superseded_by_quote_id` text REFERENCES quotes(id) ON DELETE set null;--> statement-breakpoint
CREATE UNIQUE INDEX `quotes_org_number_rev_uq` ON `quotes` (`org_id`,`quote_number`,`rev_number`);--> statement-breakpoint
CREATE UNIQUE INDEX `quotes_supersedes_uq` ON `quotes` (`org_id`,`supersedes_quote_id`);