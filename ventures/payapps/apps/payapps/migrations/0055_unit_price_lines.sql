ALTER TABLE `pay_app_lines` ADD `quantity_this_period_milli` integer;--> statement-breakpoint
ALTER TABLE `sov_lines` ADD `unit` text;--> statement-breakpoint
ALTER TABLE `sov_lines` ADD `unit_price_micros` integer;--> statement-breakpoint
ALTER TABLE `sov_lines` ADD `quantity_milli` integer;