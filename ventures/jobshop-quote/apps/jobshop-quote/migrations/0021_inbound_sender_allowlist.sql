ALTER TABLE `shop_settings` ADD `inbound_allowed_senders` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `shop_settings` ADD `inbound_refused_senders` text DEFAULT '[]' NOT NULL;