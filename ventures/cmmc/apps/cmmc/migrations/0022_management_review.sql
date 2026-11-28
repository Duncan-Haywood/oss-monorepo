CREATE TABLE `management_review` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`held_on` text NOT NULL,
	`period_from` text NOT NULL,
	`period_to` text NOT NULL,
	`attendees` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`inputs` text NOT NULL,
	`outputs` text NOT NULL,
	`actions` text NOT NULL,
	`facts` text,
	`next_review_on` text,
	`finalised_on` text,
	`finalised_by` text,
	`created_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`finalised_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `management_review_org_idx` ON `management_review` (`org_id`,`held_on`);