CREATE TABLE `fai_inspections` (
	`file_id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`rfq_id` text NOT NULL,
	`entries` text DEFAULT '{}' NOT NULL,
	`added` text DEFAULT '[]' NOT NULL,
	`updated_by` text,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`file_id`) REFERENCES `rfq_files`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`rfq_id`) REFERENCES `rfqs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`updated_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
