CREATE TABLE `estimate_alternates` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`estimate_id` text NOT NULL,
	`bid_item_key` text NOT NULL,
	`kind` text NOT NULL,
	`accepted` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`estimate_id`) REFERENCES `estimates`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `estimate_alternates_item_uq` ON `estimate_alternates` (`org_id`,`estimate_id`,`bid_item_key`);