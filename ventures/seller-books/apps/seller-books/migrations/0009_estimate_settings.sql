CREATE TABLE `estimate_settings` (
	`org_id` text NOT NULL,
	`year` integer NOT NULL,
	`filing` text NOT NULL,
	`wages_cents` integer NOT NULL,
	`other_income_cents` integer NOT NULL,
	`withholding_cents` integer NOT NULL,
	`prior_year_tax_cents` integer,
	`prior_agi_over_150k` integer NOT NULL,
	`mileage_rate` real,
	`paid_q1_cents` integer NOT NULL,
	`paid_q2_cents` integer NOT NULL,
	`paid_q3_cents` integer NOT NULL,
	`paid_q4_cents` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `estimate_settings_org_year_idx` ON `estimate_settings` (`org_id`,`year`);