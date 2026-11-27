CREATE TABLE `onboarding_emails` (
	`org_id` text NOT NULL,
	`kind` text NOT NULL,
	`sent_on` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`org_id`, `kind`),
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
