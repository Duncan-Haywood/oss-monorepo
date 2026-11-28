CREATE TABLE `incident` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`title` text NOT NULL,
	`clause` text DEFAULT 'unsure' NOT NULL,
	`affects` text DEFAULT 'unsure' NOT NULL,
	`role` text DEFAULT 'prime' NOT NULL,
	`higher_tier` text DEFAULT '' NOT NULL,
	`contract_ref` text DEFAULT '' NOT NULL,
	`discovered_at` text NOT NULL,
	`reported_at` text,
	`report_number` text DEFAULT '' NOT NULL,
	`higher_tier_notified_at` text,
	`malware` text DEFAULT 'unknown' NOT NULL,
	`cloud` text DEFAULT 'unknown' NOT NULL,
	`systems` text DEFAULT '' NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`steps` text NOT NULL,
	`timeline` text NOT NULL,
	`closed_on` text,
	`lessons` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `incident_org_idx` ON `incident` (`org_id`,`discovered_at`);