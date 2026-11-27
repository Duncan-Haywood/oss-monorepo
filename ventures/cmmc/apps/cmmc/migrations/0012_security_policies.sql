CREATE TABLE `security_policy` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`family` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`owner_user_id` text,
	`review_months` integer DEFAULT 12 NOT NULL,
	`approved_on` text,
	`approved_by` text,
	`review_due` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`owner_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`approved_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `security_policy_org_family_uq` ON `security_policy` (`org_id`,`family`);--> statement-breakpoint
CREATE TABLE `security_policy_event` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`policy_id` text NOT NULL,
	`kind` text NOT NULL,
	`version` integer NOT NULL,
	`title` text NOT NULL,
	`body` text,
	`day` text NOT NULL,
	`actor_user_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`policy_id`) REFERENCES `security_policy`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `security_policy_event_policy_idx` ON `security_policy_event` (`org_id`,`policy_id`,`created_at`);