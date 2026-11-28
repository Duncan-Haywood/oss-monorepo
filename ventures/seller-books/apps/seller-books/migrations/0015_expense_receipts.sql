CREATE TABLE `expense_receipt` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`expense_id` text NOT NULL,
	`file_name` text NOT NULL,
	`content_type` text NOT NULL,
	`size` integer NOT NULL,
	`sha256` text NOT NULL,
	`created_by` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`expense_id`) REFERENCES `expense`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `expense_receipt_org_idx` ON `expense_receipt` (`org_id`);--> statement-breakpoint
CREATE INDEX `expense_receipt_expense_idx` ON `expense_receipt` (`expense_id`);--> statement-breakpoint
CREATE TABLE `expense_receipt_chunk` (
	`receipt_id` text NOT NULL,
	`chunk` integer NOT NULL,
	`bytes` blob NOT NULL,
	PRIMARY KEY(`receipt_id`, `chunk`),
	FOREIGN KEY (`receipt_id`) REFERENCES `expense_receipt`(`id`) ON UPDATE no action ON DELETE cascade
);
