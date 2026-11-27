CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `account_user_idx` ON `account` (`user_id`);--> statement-breakpoint
CREATE TABLE `invitation` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`email` text NOT NULL,
	`role` text DEFAULT 'editor' NOT NULL,
	`token_hash` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`expires_at` integer NOT NULL,
	`inviter_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`inviter_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invitation_token_hash_unique` ON `invitation` (`token_hash`);--> statement-breakpoint
CREATE INDEX `invitation_org_idx` ON `invitation` (`organization_id`);--> statement-breakpoint
CREATE TABLE `member` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text DEFAULT 'viewer' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `member_org_user_uq` ON `member` (`organization_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `organization` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`logo` text,
	`metadata` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `organization_slug_unique` ON `organization` (`slug`);--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	`active_organization_id` text,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);--> statement-breakpoint
CREATE INDEX `session_user_idx` ON `session` (`user_id`);--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `verification_identifier_idx` ON `verification` (`identifier`);--> statement-breakpoint
CREATE TABLE `expense` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`date` text NOT NULL,
	`category` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`vendor` text,
	`memo` text,
	`platform` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `expense_org_date_idx` ON `expense` (`org_id`,`date`);--> statement-breakpoint
CREATE TABLE `import_batch` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`platform` text NOT NULL,
	`report_kind` text NOT NULL,
	`file_name` text NOT NULL,
	`sha256` text NOT NULL,
	`row_count` integer NOT NULL,
	`sales_created` integer NOT NULL,
	`charges_created` integer NOT NULL,
	`duplicates_skipped` integer NOT NULL,
	`rows_skipped` integer NOT NULL,
	`warnings` text NOT NULL,
	`created_by` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `import_batch_org_idx` ON `import_batch` (`org_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `inventory_item` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`lot_id` text,
	`sku` text,
	`title` text NOT NULL,
	`acquired_date` text NOT NULL,
	`cost_cents` integer NOT NULL,
	`cost_is_manual` integer DEFAULT false NOT NULL,
	`status` text DEFAULT 'in_stock' NOT NULL,
	`disposed_date` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`lot_id`) REFERENCES `inventory_lot`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `inventory_item_org_idx` ON `inventory_item` (`org_id`,`status`);--> statement-breakpoint
CREATE INDEX `inventory_item_org_sku_idx` ON `inventory_item` (`org_id`,`sku`);--> statement-breakpoint
CREATE INDEX `inventory_item_lot_idx` ON `inventory_item` (`lot_id`);--> statement-breakpoint
CREATE TABLE `inventory_lot` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`name` text NOT NULL,
	`acquired_date` text NOT NULL,
	`vendor` text,
	`total_cost_cents` integer NOT NULL,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `inventory_lot_org_idx` ON `inventory_lot` (`org_id`);--> statement-breakpoint
CREATE TABLE `mileage_trip` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`date` text NOT NULL,
	`purpose` text NOT NULL,
	`start_place` text,
	`end_place` text,
	`miles_tenths` integer NOT NULL,
	`round_trip` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `mileage_trip_org_date_idx` ON `mileage_trip` (`org_id`,`date`);--> statement-breakpoint
CREATE TABLE `platform_charge` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`platform` text NOT NULL,
	`external_id` text NOT NULL,
	`date` text NOT NULL,
	`kind` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`order_id` text,
	`description` text,
	`import_batch_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`import_batch_id`) REFERENCES `import_batch`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `platform_charge_org_platform_ext_uq` ON `platform_charge` (`org_id`,`platform`,`external_id`);--> statement-breakpoint
CREATE INDEX `platform_charge_org_date_idx` ON `platform_charge` (`org_id`,`date`);--> statement-breakpoint
CREATE TABLE `sale` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`platform` text NOT NULL,
	`kind` text NOT NULL,
	`external_id` text NOT NULL,
	`order_id` text,
	`date` text NOT NULL,
	`title` text,
	`sku` text,
	`quantity` integer DEFAULT 1 NOT NULL,
	`item_cents` integer DEFAULT 0 NOT NULL,
	`shipping_charged_cents` integer DEFAULT 0 NOT NULL,
	`sales_tax_cents` integer DEFAULT 0 NOT NULL,
	`refund_cents` integer DEFAULT 0 NOT NULL,
	`shipping_label_cents` integer DEFAULT 0 NOT NULL,
	`net_cents` integer,
	`inventory_item_id` text,
	`import_batch_id` text,
	`notes` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`import_batch_id`) REFERENCES `import_batch`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sale_org_platform_ext_uq` ON `sale` (`org_id`,`platform`,`external_id`);--> statement-breakpoint
CREATE INDEX `sale_org_date_idx` ON `sale` (`org_id`,`date`);--> statement-breakpoint
CREATE INDEX `sale_org_item_idx` ON `sale` (`org_id`,`inventory_item_id`);--> statement-breakpoint
CREATE TABLE `sale_fee` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`sale_id` text NOT NULL,
	`kind` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`source_column` text NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`sale_id`) REFERENCES `sale`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sale_fee_org_sale_idx` ON `sale_fee` (`org_id`,`sale_id`);