ALTER TABLE `inventory_item` ADD `return_sale_id` text REFERENCES sale(id) ON DELETE cascade;--> statement-breakpoint
ALTER TABLE `inventory_item` ADD `returned_from_item_id` text;--> statement-breakpoint
CREATE INDEX `inventory_item_org_return_sale_idx` ON `inventory_item` (`org_id`,`return_sale_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `inventory_item_org_returned_from_uq` ON `inventory_item` (`org_id`,`returned_from_item_id`);