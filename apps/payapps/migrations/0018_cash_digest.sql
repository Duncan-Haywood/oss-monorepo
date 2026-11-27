CREATE TABLE `cash_digest_subscriptions` (
	`org_id` text NOT NULL,
	`user_id` text NOT NULL,
	`last_sent_on` text,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`org_id`, `user_id`),
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
