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
	`role` text NOT NULL,
	`token_hash` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`inviter_id` text,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`inviter_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invitation_token_hash_unique` ON `invitation` (`token_hash`);--> statement-breakpoint
CREATE INDEX `invitation_org_idx` ON `invitation` (`organization_id`);--> statement-breakpoint
CREATE TABLE `member` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL,
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
CREATE TABLE `llm_calls` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text,
	`purpose` text NOT NULL,
	`model` text NOT NULL,
	`input_tokens` integer NOT NULL,
	`output_tokens` integer NOT NULL,
	`cache_read_tokens` integer DEFAULT 0 NOT NULL,
	`cache_write_tokens` integer DEFAULT 0 NOT NULL,
	`cost_micros` integer NOT NULL,
	`latency_ms` integer NOT NULL,
	`stop_reason` text,
	`error` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `llm_calls_org_idx` ON `llm_calls` (`org_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `quote_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`quote_id` text NOT NULL,
	`rfq_part_id` text,
	`position` integer DEFAULT 0 NOT NULL,
	`part_number` text NOT NULL,
	`revision` text,
	`description` text,
	`inputs` text NOT NULL,
	`breaks` text,
	`basis` text NOT NULL,
	`issues` text NOT NULL,
	`snapshot` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`quote_id`) REFERENCES `quotes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`rfq_part_id`) REFERENCES `rfq_parts`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `quote_lines_quote_idx` ON `quote_lines` (`org_id`,`quote_id`);--> statement-breakpoint
CREATE TABLE `quotes` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`rfq_id` text,
	`quote_number` integer NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`customer_company` text NOT NULL,
	`customer_contact` text,
	`customer_email` text,
	`lead_time_text` text,
	`valid_until` text,
	`notes` text,
	`cover_note` text,
	`cover_note_source` text,
	`headline_total_cents` integer,
	`sent_at` integer,
	`sent_pdf_key` text,
	`sent_pdf_sha256` text,
	`decided_at` integer,
	`lost_reason` text,
	`po_number` text,
	`won_amount_cents` integer,
	`created_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`rfq_id`) REFERENCES `rfqs`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `quotes_org_number_uq` ON `quotes` (`org_id`,`quote_number`);--> statement-breakpoint
CREATE INDEX `quotes_org_status_idx` ON `quotes` (`org_id`,`status`);--> statement-breakpoint
CREATE TABLE `rfq_files` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`rfq_id` text NOT NULL,
	`r2_key` text NOT NULL,
	`file_name` text NOT NULL,
	`mime_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`sha256` text NOT NULL,
	`extracted_text` text,
	`conversion_error` text,
	`geometry` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`rfq_id`) REFERENCES `rfqs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `rfq_files_rfq_idx` ON `rfq_files` (`org_id`,`rfq_id`);--> statement-breakpoint
CREATE TABLE `rfq_parts` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`rfq_id` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`part_number` text,
	`revision` text,
	`description` text,
	`material_text` text,
	`material_id` text,
	`quantities` text NOT NULL,
	`tolerances` text,
	`finish_text` text,
	`finishing_op_ids` text NOT NULL,
	`due_date` text,
	`notes` text,
	`sources` text NOT NULL,
	`origin` text DEFAULT 'user' NOT NULL,
	`confirmed` integer DEFAULT false NOT NULL,
	`geometry_file_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`rfq_id`) REFERENCES `rfqs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `rfq_parts_rfq_idx` ON `rfq_parts` (`org_id`,`rfq_id`);--> statement-breakpoint
CREATE TABLE `rfqs` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`status` text DEFAULT 'new' NOT NULL,
	`subject` text,
	`customer_company` text,
	`customer_contact` text,
	`customer_email` text,
	`body_text` text DEFAULT '' NOT NULL,
	`missing_info` text NOT NULL,
	`extraction_warnings` text NOT NULL,
	`extracted_at` integer,
	`created_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `rfqs_org_idx` ON `rfqs` (`org_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `finishing_ops` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`name` text NOT NULL,
	`per_part_cents` integer DEFAULT 0 NOT NULL,
	`lot_charge_cents` integer DEFAULT 0 NOT NULL,
	`outside_service` integer DEFAULT false NOT NULL,
	`lead_days` integer,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `finishing_ops_org_idx` ON `finishing_ops` (`org_id`);--> statement-breakpoint
CREATE TABLE `machines` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`hourly_rate_cents` integer NOT NULL,
	`setup_rate_cents` integer,
	`default_setup_minutes` integer DEFAULT 0 NOT NULL,
	`removal_rate_in3_per_min` real,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `machines_org_idx` ON `machines` (`org_id`);--> statement-breakpoint
CREATE TABLE `materials` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`name` text NOT NULL,
	`pricing_basis` text NOT NULL,
	`price_per_lb_cents` integer,
	`density_lb_per_in3` real,
	`stock_price_cents` integer,
	`stock_description` text,
	`scrap_bps` integer DEFAULT 0 NOT NULL,
	`min_charge_cents` integer DEFAULT 0 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `materials_org_idx` ON `materials` (`org_id`);--> statement-breakpoint
CREATE TABLE `shop_settings` (
	`org_id` text PRIMARY KEY NOT NULL,
	`display_name` text NOT NULL,
	`address_lines` text NOT NULL,
	`phone` text,
	`email` text,
	`labor_markup_bps` integer DEFAULT 0 NOT NULL,
	`material_markup_bps` integer DEFAULT 0 NOT NULL,
	`outside_service_markup_bps` integer DEFAULT 0 NOT NULL,
	`minimum_line_cents` integer DEFAULT 0 NOT NULL,
	`default_quantities` text NOT NULL,
	`quote_valid_days` integer DEFAULT 30 NOT NULL,
	`default_lead_time_text` text,
	`quote_terms` text,
	`next_quote_number` integer DEFAULT 1001 NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
