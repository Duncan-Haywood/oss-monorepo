CREATE TABLE `material_price_changes` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`material_id` text NOT NULL,
	`pricing_basis` text NOT NULL,
	`price_per_lb_cents` integer,
	`stock_price_cents` integer,
	`source` text NOT NULL,
	`by_user_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`material_id`) REFERENCES `materials`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `material_price_changes_material_idx` ON `material_price_changes` (`org_id`,`material_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `materials` ADD `price_set_at` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
-- Hand-added: existing rows take their last edit as the price date (the closest date the card has),
-- and one "baseline" history row each, so the history starts from the price on the card today.
UPDATE `materials` SET `price_set_at` = `updated_at`;--> statement-breakpoint
INSERT INTO `material_price_changes` (`id`, `org_id`, `material_id`, `pricing_basis`, `price_per_lb_cents`, `stock_price_cents`, `source`, `by_user_id`, `created_at`)
SELECT 'mpc_base_' || `id`, `org_id`, `id`, `pricing_basis`, `price_per_lb_cents`, `stock_price_cents`, 'baseline', NULL, `updated_at` FROM `materials`;--> statement-breakpoint
ALTER TABLE `shop_settings` ADD `material_price_max_age_days` integer DEFAULT 90;