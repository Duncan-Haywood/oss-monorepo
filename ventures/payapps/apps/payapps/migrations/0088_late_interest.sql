ALTER TABLE `projects` ADD `late_interest_bps` integer;--> statement-breakpoint
ALTER TABLE `projects` ADD `late_interest_per` text DEFAULT 'month' NOT NULL;--> statement-breakpoint
ALTER TABLE `projects` ADD `late_interest_method` text DEFAULT 'prorata' NOT NULL;--> statement-breakpoint
ALTER TABLE `projects` ADD `late_interest_source` text;