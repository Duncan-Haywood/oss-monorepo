CREATE TABLE `price_list_items` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`category` text NOT NULL,
	`code` text,
	`description` text NOT NULL,
	`unit` text,
	`unit_cost_micros` integer NOT NULL,
	`note` text,
	`match_key` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `price_list_items_key_uq` ON `price_list_items` (`org_id`,`match_key`);