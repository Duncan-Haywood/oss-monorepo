CREATE TABLE `allowance_notices` (
	`org_id` text NOT NULL,
	`period` text NOT NULL,
	`threshold` integer NOT NULL,
	`used` integer NOT NULL,
	`allowance` integer NOT NULL,
	`sent` integer DEFAULT 0 NOT NULL,
	`failed` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`org_id`, `period`, `threshold`),
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
