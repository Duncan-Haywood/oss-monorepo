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
CREATE TABLE `change_order_items` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`change_order_id` text NOT NULL,
	`sov_line_id` text NOT NULL,
	`amount_cents` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`change_order_id`) REFERENCES `change_orders`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`sov_line_id`) REFERENCES `sov_lines`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `change_order_items_co_idx` ON `change_order_items` (`org_id`,`change_order_id`);--> statement-breakpoint
CREATE TABLE `change_orders` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`project_id` text NOT NULL,
	`number` text NOT NULL,
	`description` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`approved_on` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `change_orders_project_idx` ON `change_orders` (`org_id`,`project_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `change_orders_number_uq` ON `change_orders` (`project_id`,`number`);--> statement-breakpoint
CREATE TABLE `pay_app_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`pay_app_id` text NOT NULL,
	`sov_line_id` text NOT NULL,
	`work_this_period_cents` integer DEFAULT 0 NOT NULL,
	`stored_materials_cents` integer DEFAULT 0 NOT NULL,
	`retainage_released_cents` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`pay_app_id`) REFERENCES `pay_apps`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`sov_line_id`) REFERENCES `sov_lines`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `pay_app_lines_app_idx` ON `pay_app_lines` (`org_id`,`pay_app_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `pay_app_lines_uq` ON `pay_app_lines` (`pay_app_id`,`sov_line_id`);--> statement-breakpoint
CREATE TABLE `pay_apps` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`project_id` text NOT NULL,
	`number` integer NOT NULL,
	`period_from` text NOT NULL,
	`period_to` text NOT NULL,
	`application_date` text NOT NULL,
	`retainage_pct_bps` integer NOT NULL,
	`stored_retainage_pct_bps` integer NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`submitted_at` integer,
	`certified_amount_cents` integer,
	`certified_at` integer,
	`paid_at` integer,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `pay_apps_project_idx` ON `pay_apps` (`org_id`,`project_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `pay_apps_number_uq` ON `pay_apps` (`project_id`,`number`);--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`name` text NOT NULL,
	`number` text,
	`location` text,
	`gc_name` text NOT NULL,
	`gc_address` text,
	`owner_name` text,
	`architect_name` text,
	`contract_date` text,
	`original_contract_sum_cents` integer NOT NULL,
	`retainage_pct_bps` integer DEFAULT 1000 NOT NULL,
	`stored_retainage_pct_bps` integer DEFAULT 1000 NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `projects_org_idx` ON `projects` (`org_id`);--> statement-breakpoint
CREATE TABLE `sov_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`project_id` text NOT NULL,
	`item_number` text NOT NULL,
	`description` text NOT NULL,
	`original_cents` integer NOT NULL,
	`sort_order` integer NOT NULL,
	`change_order_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sov_lines_project_idx` ON `sov_lines` (`org_id`,`project_id`);