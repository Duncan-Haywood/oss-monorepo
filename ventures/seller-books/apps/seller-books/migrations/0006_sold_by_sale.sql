ALTER TABLE `inventory_item` ADD `sold_by_sale_id` text;--> statement-breakpoint
CREATE INDEX `inventory_item_org_sold_by_idx` ON `inventory_item` (`org_id`,`sold_by_sale_id`);--> statement-breakpoint
-- Backfill: an item an order already sold records that order (each order linked one item before this).
UPDATE `inventory_item` SET `sold_by_sale_id` = (
	SELECT `sale`.`id` FROM `sale`
	WHERE `sale`.`org_id` = `inventory_item`.`org_id` AND `sale`.`inventory_item_id` = `inventory_item`.`id`
	ORDER BY `sale`.`date`, `sale`.`id` LIMIT 1
) WHERE `status` = 'sold';
