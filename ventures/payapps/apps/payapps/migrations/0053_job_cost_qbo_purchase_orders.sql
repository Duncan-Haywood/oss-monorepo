ALTER TABLE `job_cost_commitments` ADD `qbo_source` text;--> statement-breakpoint
CREATE UNIQUE INDEX `job_cost_commitments_qbo_source_idx` ON `job_cost_commitments` (`org_id`,`qbo_source`);--> statement-breakpoint
ALTER TABLE `job_cost_entries` ADD `qbo_po_source` text;