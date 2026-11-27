CREATE TABLE `rfq_counts` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`rfq_id` text NOT NULL,
	`units` integer NOT NULL,
	`pages` integer NOT NULL,
	`counted_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`rfq_id`) REFERENCES `rfqs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `rfq_counts_org_idx` ON `rfq_counts` (`org_id`,`counted_at`);--> statement-breakpoint
CREATE INDEX `rfq_counts_rfq_idx` ON `rfq_counts` (`org_id`,`rfq_id`);--> statement-breakpoint
ALTER TABLE `rfq_files` ADD `page_count` integer;--> statement-breakpoint
-- RFQs counted before the page rule: each used one RFQ in the month it was first read. Their pages
-- were not recorded, so 0 (a later read of a bigger package counts only what it adds over 10 pages).
INSERT INTO `rfq_counts` (`id`, `org_id`, `rfq_id`, `units`, `pages`, `counted_at`)
SELECT 'rfc_' || `id`, `org_id`, `id`, 1, 0, `counted_at` FROM `rfqs` WHERE `counted_at` IS NOT NULL;
