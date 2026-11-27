ALTER TABLE `quote_lines` ADD `prefilled_from` text;--> statement-breakpoint
ALTER TABLE `shop_settings` ADD `prefill_repeat_parts` integer DEFAULT false NOT NULL;