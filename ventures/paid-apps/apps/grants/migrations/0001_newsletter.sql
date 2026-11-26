CREATE TABLE `notification_opt_outs` (
	`org_id` text NOT NULL,
	`email_hash` text NOT NULL,
	`kind` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`org_id`, `email_hash`, `kind`),
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `marketing_email_log` (
	`subscriber_id` text NOT NULL,
	`step_key` text NOT NULL,
	`sent_at` integer NOT NULL,
	FOREIGN KEY (`subscriber_id`) REFERENCES `marketing_subscribers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `marketing_email_log_sub_step_uq` ON `marketing_email_log` (`subscriber_id`,`step_key`);--> statement-breakpoint
CREATE TABLE `marketing_subscribers` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`consent_source` text NOT NULL,
	`consent_text_version` text NOT NULL,
	`consent_ip_hash` text,
	`confirm_token_hash` text,
	`confirm_token_expires_at` integer,
	`confirm_sent_at` integer,
	`confirm_send_count` integer DEFAULT 0 NOT NULL,
	`confirmed_at` integer,
	`unsubscribed_at` integer,
	`unsubscribe_method` text,
	`last_sequence_sent_at` integer,
	`next_sequence_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `marketing_subscribers_email_uq` ON `marketing_subscribers` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `marketing_subscribers_confirm_token_uq` ON `marketing_subscribers` (`confirm_token_hash`);--> statement-breakpoint
CREATE INDEX `marketing_subscribers_sequence_idx` ON `marketing_subscribers` (`status`,`next_sequence_at`);--> statement-breakpoint
CREATE INDEX `marketing_subscribers_status_created_idx` ON `marketing_subscribers` (`status`,`created_at`);