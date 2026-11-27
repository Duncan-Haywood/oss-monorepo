ALTER TABLE `material_price_changes` ADD `price_per_cwt_cents` integer;--> statement-breakpoint
ALTER TABLE `material_price_changes` ADD `price_per_metre_cents` integer;--> statement-breakpoint
ALTER TABLE `materials` ADD `price_per_cwt_cents` integer;--> statement-breakpoint
ALTER TABLE `materials` ADD `price_per_metre_cents` integer;