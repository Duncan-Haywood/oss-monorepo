CREATE TABLE `service_provider` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`name` text NOT NULL,
	`data` text NOT NULL,
	`is_csp` integer DEFAULT false NOT NULL,
	`services` text DEFAULT '' NOT NULL,
	`fedramp_basis` text DEFAULT '' NOT NULL,
	`service_description_ref` text DEFAULT '' NOT NULL,
	`crm_ref` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`controls` text DEFAULT '[]' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `service_provider_org_idx` ON `service_provider` (`org_id`);