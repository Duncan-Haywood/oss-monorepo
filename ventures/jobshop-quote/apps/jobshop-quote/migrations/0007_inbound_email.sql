ALTER TABLE `rfqs` ADD `source` text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE `rfqs` ADD `from_address` text;--> statement-breakpoint
ALTER TABLE `rfqs` ADD `message_id` text;--> statement-breakpoint
ALTER TABLE `rfqs` ADD `intake_notes` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `rfqs_message_idx` ON `rfqs` (`org_id`,`message_id`);--> statement-breakpoint
CREATE INDEX `rfqs_source_idx` ON `rfqs` (`org_id`,`source`,`created_at`);--> statement-breakpoint
ALTER TABLE `shop_settings` ADD `inbound_token` text;--> statement-breakpoint
CREATE UNIQUE INDEX `shop_settings_inbound_token_unique` ON `shop_settings` (`inbound_token`);