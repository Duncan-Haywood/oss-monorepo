CREATE TABLE `audit_finding` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`audit_id` text NOT NULL,
	`kind` text NOT NULL,
	`clause_id` text,
	`description` text NOT NULL,
	`evidence` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`audit_id`) REFERENCES `internal_audit`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `audit_finding_audit_idx` ON `audit_finding` (`org_id`,`audit_id`);--> statement-breakpoint
CREATE TABLE `corrective_action` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`ref` text NOT NULL,
	`source` text NOT NULL,
	`finding_id` text,
	`clause_id` text,
	`nonconformity` text NOT NULL,
	`containment` text DEFAULT '' NOT NULL,
	`root_cause` text DEFAULT '' NOT NULL,
	`action` text DEFAULT '' NOT NULL,
	`owner_user_id` text,
	`raised_on` text NOT NULL,
	`due_on` text,
	`completed_on` text,
	`verify_due_on` text,
	`verified_on` text,
	`verified_by_name` text DEFAULT '' NOT NULL,
	`effective` integer,
	`verification_notes` text DEFAULT '' NOT NULL,
	`closed_on` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`finding_id`) REFERENCES `audit_finding`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`owner_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `corrective_action_org_ref_uq` ON `corrective_action` (`org_id`,`ref`);--> statement-breakpoint
CREATE TABLE `internal_audit` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`title` text NOT NULL,
	`clause_ids` text NOT NULL,
	`process` text DEFAULT '' NOT NULL,
	`planned_on` text NOT NULL,
	`auditor_user_id` text,
	`auditor_name` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'planned' NOT NULL,
	`completed_on` text,
	`summary` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`auditor_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `internal_audit_org_idx` ON `internal_audit` (`org_id`,`planned_on`);