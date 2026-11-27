ALTER TABLE `quotes` ADD `expiry_reminded_at` integer;--> statement-breakpoint
ALTER TABLE `member_notifications` ADD `quote_expiry` integer DEFAULT true NOT NULL;