ALTER TABLE `projects` ADD `opening_app_number` integer;--> statement-breakpoint
ALTER TABLE `projects` ADD `opening_period_to` text;--> statement-breakpoint
ALTER TABLE `projects` ADD `opening_previous_certificates_cents` integer;--> statement-breakpoint
ALTER TABLE `projects` ADD `opening_retainage_held_cents` integer;--> statement-breakpoint
ALTER TABLE `sov_lines` ADD `opening_completed_cents` integer DEFAULT 0 NOT NULL;