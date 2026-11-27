CREATE TABLE `left_out_merchant` (
	`org_id` text NOT NULL,
	`merchant` text NOT NULL,
	`count` integer NOT NULL,
	`last_date` text NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `left_out_merchant_org_merchant_idx` ON `left_out_merchant` (`org_id`,`merchant`);