CREATE TABLE `import_mapping` (
	`org_id` text NOT NULL,
	`platform` text NOT NULL,
	`mapping` text NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `import_mapping_org_platform_idx` ON `import_mapping` (`org_id`,`platform`);