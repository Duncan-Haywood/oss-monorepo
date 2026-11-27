CREATE TABLE `legal_acceptance` (
	`user_id` text NOT NULL,
	`policy_version` text NOT NULL,
	`accepted_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `legal_acceptance_user_version_idx` ON `legal_acceptance` (`user_id`,`policy_version`);