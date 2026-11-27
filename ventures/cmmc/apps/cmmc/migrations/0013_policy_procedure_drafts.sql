CREATE TABLE `policy_procedure_draft` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`family` text NOT NULL,
	`control_id` text NOT NULL,
	`text` text NOT NULL,
	`questions` text NOT NULL,
	`generated_by` text,
	`generated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`generated_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `policy_procedure_draft_org_control_uq` ON `policy_procedure_draft` (`org_id`,`control_id`);