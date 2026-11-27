CREATE TABLE `renewal_notice` (
	`org_id` text NOT NULL,
	`renews_on` text NOT NULL,
	`provider_subscription_id` text,
	`recipients` integer DEFAULT 0 NOT NULL,
	`late` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `renewal_notice_org_renews_idx` ON `renewal_notice` (`org_id`,`renews_on`);--> statement-breakpoint
ALTER TABLE `pending_checkouts` ADD `renewal_terms_version` text;--> statement-breakpoint
ALTER TABLE `pending_checkouts` ADD `renewal_consent_at` integer;