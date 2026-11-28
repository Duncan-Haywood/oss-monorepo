ALTER TABLE `inventory_item` ADD `estimated_value_cents` integer;--> statement-breakpoint
ALTER TABLE `inventory_lot` ADD `split_by` text DEFAULT 'even' NOT NULL;