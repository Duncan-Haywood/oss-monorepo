CREATE TABLE `purchase_receipt` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`lot_id` text,
	`item_id` text,
	`file_name` text NOT NULL,
	`content_type` text NOT NULL,
	`size` integer NOT NULL,
	`sha256` text NOT NULL,
	`created_by` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`lot_id`) REFERENCES `inventory_lot`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`item_id`) REFERENCES `inventory_item`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `purchase_receipt_org_idx` ON `purchase_receipt` (`org_id`);--> statement-breakpoint
CREATE INDEX `purchase_receipt_lot_idx` ON `purchase_receipt` (`lot_id`);--> statement-breakpoint
CREATE INDEX `purchase_receipt_item_idx` ON `purchase_receipt` (`item_id`);--> statement-breakpoint
CREATE TABLE `purchase_receipt_chunk` (
	`receipt_id` text NOT NULL,
	`chunk` integer NOT NULL,
	`bytes` blob NOT NULL,
	PRIMARY KEY(`receipt_id`, `chunk`),
	FOREIGN KEY (`receipt_id`) REFERENCES `purchase_receipt`(`id`) ON UPDATE no action ON DELETE cascade
);
