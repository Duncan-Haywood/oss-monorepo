CREATE TABLE `sworn_statement_copies` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`org_id` text NOT NULL,
	`copy_key` text NOT NULL,
	`state` text NOT NULL,
	`pay_app` text NOT NULL,
	`statement_date` text NOT NULL,
	`data` text NOT NULL,
	`owing_cents` integer NOT NULL,
	`balance_cents` integer NOT NULL,
	`saved_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`saved_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sworn_copies_project_key_uq` ON `sworn_statement_copies` (`project_id`,`copy_key`);--> statement-breakpoint
CREATE INDEX `sworn_copies_org_idx` ON `sworn_statement_copies` (`org_id`);