ALTER TABLE `material_price_changes` ADD `price_per_foot_cents` integer;--> statement-breakpoint
ALTER TABLE `materials` ADD `price_per_foot_cents` integer;--> statement-breakpoint
ALTER TABLE `materials` ADD `cut_allowance_in` real;--> statement-breakpoint
ALTER TABLE `materials` ADD `bar_length_in` real;--> statement-breakpoint
ALTER TABLE `materials` ADD `bar_remnant_in` real;