CREATE TABLE `controlled_document` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`doc_number` text NOT NULL,
	`title` text NOT NULL,
	`kind` text NOT NULL,
	`origin` text DEFAULT 'internal' NOT NULL,
	`revision` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`released_revision` text,
	`issuer` text DEFAULT '' NOT NULL,
	`location` text DEFAULT '' NOT NULL,
	`owner_user_id` text,
	`approved_by` text,
	`approved_on` text,
	`effective_on` text,
	`review_months` integer,
	`review_due` text,
	`notes` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`owner_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`approved_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `controlled_document_org_number_uq` ON `controlled_document` (`org_id`,`doc_number`);--> statement-breakpoint
CREATE TABLE `controlled_document_event` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`document_id` text NOT NULL,
	`kind` text NOT NULL,
	`revision` text NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`by_user_id` text,
	`by_name` text DEFAULT '' NOT NULL,
	`on` text NOT NULL,
	`effective_on` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`document_id`) REFERENCES `controlled_document`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `controlled_document_event_doc_idx` ON `controlled_document_event` (`org_id`,`document_id`);