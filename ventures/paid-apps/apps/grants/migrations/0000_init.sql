CREATE TABLE `application_flags` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`application_id` text NOT NULL,
	`version_id` text NOT NULL,
	`severity` text NOT NULL,
	`kind` text NOT NULL,
	`section_key` text,
	`claim_id` text,
	`message` text NOT NULL,
	`suggested_question` text,
	`status` text DEFAULT 'open' NOT NULL,
	`resolution` text,
	`resolved_by` text,
	`resolved_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`version_id`) REFERENCES `application_versions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`resolved_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `flags_app_idx` ON `application_flags` (`application_id`,`status`);--> statement-breakpoint
CREATE INDEX `flags_version_idx` ON `application_flags` (`version_id`,`status`);--> statement-breakpoint
CREATE INDEX `flags_org_idx` ON `application_flags` (`org_id`);--> statement-breakpoint
CREATE TABLE `application_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`application_id` text NOT NULL,
	`version_number` integer NOT NULL,
	`content` text NOT NULL,
	`executive_summary` text DEFAULT '' NOT NULL,
	`key_points` text DEFAULT '[]' NOT NULL,
	`grounding_report` text,
	`author_type` text NOT NULL,
	`author_id` text,
	`model` text,
	`prompt_version` text,
	`change_note` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `versions_app_num_uq` ON `application_versions` (`application_id`,`version_number`);--> statement-breakpoint
CREATE INDEX `versions_org_idx` ON `application_versions` (`org_id`);--> statement-breakpoint
CREATE TABLE `applications` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`opportunity_id` text NOT NULL,
	`match_id` text,
	`project_id` text,
	`title` text NOT NULL,
	`status` text DEFAULT 'draft_queued' NOT NULL,
	`review_tier` text,
	`review_tier_reason` text,
	`requested_amount_cents` integer,
	`deadline` integer,
	`current_version_id` text,
	`workflow_instance_id` text,
	`last_error` text,
	`created_by` text,
	`submitted_at` integer,
	`outcome_at` integer,
	`outcome_notes` text,
	`awarded_amount_cents` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`opportunity_id`) REFERENCES `opportunities`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`match_id`) REFERENCES `opportunity_matches`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `applications_org_status_idx` ON `applications` (`org_id`,`status`);--> statement-breakpoint
CREATE INDEX `applications_org_deadline_idx` ON `applications` (`org_id`,`deadline`);--> statement-breakpoint
CREATE INDEX `applications_org_updated_idx` ON `applications` (`org_id`,`updated_at`);--> statement-breakpoint
CREATE INDEX `applications_opp_idx` ON `applications` (`opportunity_id`,`org_id`);--> statement-breakpoint
CREATE INDEX `applications_match_idx` ON `applications` (`match_id`);--> statement-breakpoint
CREATE INDEX `applications_project_idx` ON `applications` (`project_id`);--> statement-breakpoint
CREATE TABLE `feedback` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`application_id` text NOT NULL,
	`version_id` text,
	`section_key` text,
	`rating` integer NOT NULL,
	`comment` text DEFAULT '' NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`created_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`version_id`) REFERENCES `application_versions`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `feedback_org_idx` ON `feedback` (`org_id`,`rating`);--> statement-breakpoint
CREATE INDEX `feedback_app_idx` ON `feedback` (`application_id`);--> statement-breakpoint
CREATE INDEX `feedback_version_idx` ON `feedback` (`version_id`);--> statement-breakpoint
CREATE TABLE `reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`application_id` text NOT NULL,
	`version_id` text NOT NULL,
	`reviewer_id` text NOT NULL,
	`decision` text NOT NULL,
	`comments` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`version_id`) REFERENCES `application_versions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`reviewer_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `reviews_app_idx` ON `reviews` (`application_id`);--> statement-breakpoint
CREATE INDEX `reviews_version_idx` ON `reviews` (`version_id`);--> statement-breakpoint
CREATE INDEX `reviews_org_idx` ON `reviews` (`org_id`);--> statement-breakpoint
CREATE TABLE `approval_delegations` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`from_user_id` text NOT NULL,
	`to_user_id` text NOT NULL,
	`until` integer NOT NULL,
	`revoked_at` integer,
	`revoked_by` text,
	`created_by` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`from_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`to_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`revoked_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `approval_delegations_org_to_idx` ON `approval_delegations` (`org_id`,`to_user_id`);--> statement-breakpoint
CREATE INDEX `approval_delegations_org_from_idx` ON `approval_delegations` (`org_id`,`from_user_id`);--> statement-breakpoint
CREATE TABLE `approval_policies` (
	`org_id` text PRIMARY KEY NOT NULL,
	`rules` text DEFAULT '[]' NOT NULL,
	`updated_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`updated_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `application_attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`application_id` text NOT NULL,
	`requirement_name` text NOT NULL,
	`requirement_key` text NOT NULL,
	`required` integer DEFAULT true NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'missing' NOT NULL,
	`document_id` text,
	`match_source` text,
	`note` text,
	`updated_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`updated_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `app_attachments_req_uq` ON `application_attachments` (`application_id`,`requirement_key`);--> statement-breakpoint
CREATE INDEX `app_attachments_org_app_idx` ON `application_attachments` (`org_id`,`application_id`);--> statement-breakpoint
CREATE INDEX `app_attachments_doc_idx` ON `application_attachments` (`document_id`);--> statement-breakpoint
CREATE TABLE `support_letter_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`application_id` text NOT NULL,
	`partner_name` text NOT NULL,
	`partner_email` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`request_token_hash` text,
	`token_nonce` text,
	`token_expires_at` integer,
	`due_at` integer,
	`sent_at` integer,
	`received_at` integer,
	`received_document_id` text,
	`fact_ids` text DEFAULT '[]' NOT NULL,
	`email_subject` text DEFAULT '' NOT NULL,
	`email_intro` text DEFAULT '' NOT NULL,
	`outline` text DEFAULT '[]' NOT NULL,
	`draft_source` text NOT NULL,
	`note` text,
	`last_reminder_at` integer,
	`reminder_count` integer DEFAULT 0 NOT NULL,
	`created_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`received_document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `support_letters_token_uq` ON `support_letter_requests` (`request_token_hash`);--> statement-breakpoint
CREATE INDEX `support_letters_org_app_idx` ON `support_letter_requests` (`org_id`,`application_id`);--> statement-breakpoint
CREATE INDEX `support_letters_status_due_idx` ON `support_letter_requests` (`status`,`due_at`);--> statement-breakpoint
CREATE INDEX `support_letters_doc_idx` ON `support_letter_requests` (`received_document_id`);--> statement-breakpoint
CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `account_user_idx` ON `account` (`user_id`);--> statement-breakpoint
CREATE TABLE `invitation` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`email` text NOT NULL,
	`role` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`expires_at` integer NOT NULL,
	`inviter_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`inviter_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `invitation_org_idx` ON `invitation` (`organization_id`);--> statement-breakpoint
CREATE TABLE `member` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text DEFAULT 'viewer' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `member_org_user_uq` ON `member` (`organization_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `organization` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`logo` text,
	`metadata` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `organization_slug_unique` ON `organization` (`slug`);--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	`active_organization_id` text,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);--> statement-breakpoint
CREATE INDEX `session_user_idx` ON `session` (`user_id`);--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `verification_identifier_idx` ON `verification` (`identifier`);--> statement-breakpoint
CREATE TABLE `award_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`award_id` text NOT NULL,
	`kind` text NOT NULL,
	`period_start` text NOT NULL,
	`period_end` text NOT NULL,
	`due_at` integer NOT NULL,
	`status` text DEFAULT 'upcoming' NOT NULL,
	`version_content` text,
	`version_number` integer DEFAULT 0 NOT NULL,
	`grounding_report` text,
	`flags` text DEFAULT '[]' NOT NULL,
	`checkin_interview_ids` text DEFAULT '[]' NOT NULL,
	`submitted_at` integer,
	`submitted_ref` text,
	`submitted_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`award_id`) REFERENCES `awards`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`submitted_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `award_reports_award_idx` ON `award_reports` (`award_id`,`due_at`);--> statement-breakpoint
CREATE INDEX `award_reports_org_due_idx` ON `award_reports` (`org_id`,`status`,`due_at`);--> statement-breakpoint
CREATE TABLE `awards` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`application_id` text,
	`project_id` text,
	`title` text NOT NULL,
	`funder_name` text NOT NULL,
	`amount_cents` integer,
	`start_date` text,
	`end_date` text,
	`grant_number` text,
	`terms_notes` text DEFAULT '' NOT NULL,
	`fact_id` text,
	`created_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `awards_org_idx` ON `awards` (`org_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `awards_org_app_uq` ON `awards` (`org_id`,`application_id`);--> statement-breakpoint
CREATE INDEX `awards_app_idx` ON `awards` (`application_id`);--> statement-breakpoint
CREATE INDEX `awards_project_idx` ON `awards` (`project_id`);--> statement-breakpoint
CREATE TABLE `billing_events` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`provider_event_id` text NOT NULL,
	`type` text NOT NULL,
	`org_id` text,
	`payload` text,
	`occurred_at` integer,
	`processed_at` integer,
	`error` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `billing_events_provider_uq` ON `billing_events` (`provider`,`provider_event_id`);--> statement-breakpoint
CREATE INDEX `billing_events_org_idx` ON `billing_events` (`org_id`);--> statement-breakpoint
CREATE TABLE `pending_checkouts` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`plan_key` text NOT NULL,
	`interval` text NOT NULL,
	`created_by` text,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`consumed_at` integer,
	`provider_subscription_id` text,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `pending_checkouts_org_idx` ON `pending_checkouts` (`org_id`);--> statement-breakpoint
CREATE TABLE `subscriptions` (
	`org_id` text PRIMARY KEY NOT NULL,
	`plan_key` text NOT NULL,
	`status` text NOT NULL,
	`provider` text,
	`provider_customer_id` text,
	`provider_subscription_id` text,
	`current_period_start` integer,
	`current_period_end` integer,
	`cancel_at_period_end` integer DEFAULT false NOT NULL,
	`provider_updated_at` integer,
	`past_due_since` integer,
	`metadata` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `subscriptions_provider_sub_idx` ON `subscriptions` (`provider`,`provider_subscription_id`);--> statement-breakpoint
CREATE TABLE `usage_events` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`kind` text NOT NULL,
	`quantity` integer DEFAULT 1 NOT NULL,
	`cost_micros` integer DEFAULT 0 NOT NULL,
	`subject_id` text,
	`period_key` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `usage_org_period_idx` ON `usage_events` (`org_id`,`period_key`,`kind`);--> statement-breakpoint
CREATE TABLE `application_budgets` (
	`application_id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`lines` text DEFAULT '[]' NOT NULL,
	`totals` text NOT NULL,
	`required_match_cents` integer,
	`notes` text DEFAULT '' NOT NULL,
	`updated_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`updated_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `application_budgets_org_idx` ON `application_budgets` (`org_id`);--> statement-breakpoint
CREATE TABLE `calendar_settings` (
	`org_id` text PRIMARY KEY NOT NULL,
	`include_amounts` integer DEFAULT false NOT NULL,
	`updated_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`updated_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `calendar_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`user_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`scope` text NOT NULL,
	`created_at` integer NOT NULL,
	`last_used_at` integer,
	`revoked_at` integer,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `calendar_tokens_hash_uq` ON `calendar_tokens` (`token_hash`);--> statement-breakpoint
CREATE INDEX `calendar_tokens_org_user_idx` ON `calendar_tokens` (`org_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `demo_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`demo_org_id` text,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `demo_sessions_user_uq` ON `demo_sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `demo_sessions_expires_idx` ON `demo_sessions` (`expires_at`);--> statement-breakpoint
CREATE TABLE `digest_log` (
	`org_id` text NOT NULL,
	`key` text NOT NULL,
	`sent_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `digest_log_org_key_uq` ON `digest_log` (`org_id`,`key`);--> statement-breakpoint
CREATE TABLE `email_preferences` (
	`user_id` text NOT NULL,
	`org_id` text NOT NULL,
	`weekly_digest` integer DEFAULT true NOT NULL,
	`deadline_reminders` integer DEFAULT true NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `org_id`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `email_preferences_org_idx` ON `email_preferences` (`org_id`);--> statement-breakpoint
CREATE TABLE `discovery_plans` (
	`org_id` text PRIMARY KEY NOT NULL,
	`plans` text DEFAULT '[]' NOT NULL,
	`facts_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `opportunity_criteria` (
	`opportunity_id` text PRIMARY KEY NOT NULL,
	`criteria` text NOT NULL,
	`model` text NOT NULL,
	`source_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`opportunity_id`) REFERENCES `opportunities`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `org_eligibility` (
	`org_id` text NOT NULL,
	`opportunity_id` text NOT NULL,
	`result` text NOT NULL,
	`checked_at` integer NOT NULL,
	PRIMARY KEY(`org_id`, `opportunity_id`),
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`opportunity_id`) REFERENCES `opportunities`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `org_funder_contacts` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`relation_id` text NOT NULL,
	`name` text NOT NULL,
	`role` text DEFAULT '' NOT NULL,
	`email` text,
	`phone` text,
	`notes` text DEFAULT '' NOT NULL,
	`preferred_contact` text,
	`created_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`relation_id`) REFERENCES `org_funder_relations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `funder_contacts_rel_idx` ON `org_funder_contacts` (`org_id`,`relation_id`);--> statement-breakpoint
CREATE INDEX `funder_contacts_created_by_idx` ON `org_funder_contacts` (`created_by`);--> statement-breakpoint
CREATE TABLE `org_funder_interactions` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`relation_id` text NOT NULL,
	`contact_id` text,
	`kind` text NOT NULL,
	`occurred_at` integer NOT NULL,
	`summary` text NOT NULL,
	`created_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`relation_id`) REFERENCES `org_funder_relations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`contact_id`) REFERENCES `org_funder_contacts`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `funder_interactions_rel_idx` ON `org_funder_interactions` (`org_id`,`relation_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `funder_interactions_contact_idx` ON `org_funder_interactions` (`contact_id`);--> statement-breakpoint
CREATE INDEX `funder_interactions_created_by_idx` ON `org_funder_interactions` (`created_by`);--> statement-breakpoint
CREATE TABLE `org_funder_relations` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`funder_id` text,
	`prospect_ein` text,
	`display_name` text NOT NULL,
	`normalized_name` text NOT NULL,
	`stage` text DEFAULT 'prospect' NOT NULL,
	`stage_source` text DEFAULT 'auto' NOT NULL,
	`origin` text DEFAULT 'manual' NOT NULL,
	`owner_id` text,
	`next_step_at` integer,
	`next_step_note` text DEFAULT '' NOT NULL,
	`next_step_notified_at` integer,
	`tags` text DEFAULT '[]' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`funder_id`) REFERENCES `funders`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`owner_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `funder_rel_org_stage_idx` ON `org_funder_relations` (`org_id`,`stage`,`updated_at`);--> statement-breakpoint
CREATE INDEX `funder_rel_org_name_idx` ON `org_funder_relations` (`org_id`,`normalized_name`);--> statement-breakpoint
CREATE UNIQUE INDEX `funder_rel_org_funder_uq` ON `org_funder_relations` (`org_id`,`funder_id`) WHERE "org_funder_relations"."funder_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX `funder_rel_org_ein_uq` ON `org_funder_relations` (`org_id`,`prospect_ein`) WHERE "org_funder_relations"."prospect_ein" is not null;--> statement-breakpoint
CREATE INDEX `funder_rel_next_step_idx` ON `org_funder_relations` (`next_step_notified_at`,`next_step_at`);--> statement-breakpoint
CREATE INDEX `funder_rel_funder_idx` ON `org_funder_relations` (`funder_id`);--> statement-breakpoint
CREATE INDEX `funder_rel_owner_idx` ON `org_funder_relations` (`owner_id`);--> statement-breakpoint
CREATE TABLE `integration_deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`destination_id` text NOT NULL,
	`event_key` text NOT NULL,
	`event` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`last_error` text,
	`sent_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`destination_id`) REFERENCES `integration_destinations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `integration_deliveries_dest_event_uq` ON `integration_deliveries` (`destination_id`,`event_key`);--> statement-breakpoint
CREATE INDEX `integration_deliveries_org_created_idx` ON `integration_deliveries` (`org_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `integration_destinations` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`provider` text NOT NULL,
	`label` text NOT NULL,
	`url_cipher` text NOT NULL,
	`url_hint` text NOT NULL,
	`events` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`created_by` text,
	`last_status` text,
	`last_error` text,
	`last_status_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `integration_destinations_org_idx` ON `integration_destinations` (`org_id`);--> statement-breakpoint
CREATE TABLE `integration_link_codes` (
	`code_hash` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`user_id` text NOT NULL,
	`purpose` text NOT NULL,
	`expires_at` integer NOT NULL,
	`used_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `integration_link_codes_org_idx` ON `integration_link_codes` (`org_id`);--> statement-breakpoint
CREATE TABLE `slack_command_receipts` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`document_id` text NOT NULL,
	`response_url_cipher` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'waiting' NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `slack_command_receipts_org_idx` ON `slack_command_receipts` (`org_id`);--> statement-breakpoint
CREATE TABLE `slack_user_links` (
	`team_id` text NOT NULL,
	`slack_user_id` text NOT NULL,
	`org_id` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`team_id`, `slack_user_id`),
	FOREIGN KEY (`team_id`) REFERENCES `slack_workspaces`(`team_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `slack_user_links_org_user_idx` ON `slack_user_links` (`org_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `slack_workspaces` (
	`team_id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`team_domain` text,
	`connected_by` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`connected_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `slack_workspaces_org_idx` ON `slack_workspaces` (`org_id`);--> statement-breakpoint
CREATE TABLE `interview_turns` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`interview_id` text NOT NULL,
	`ordinal` integer NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`input_mode` text DEFAULT 'text' NOT NULL,
	`audio_r2_key` text,
	`topic_key` text,
	`speaker_name` text,
	`created_by` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`interview_id`) REFERENCES `interviews`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `turns_interview_idx` ON `interview_turns` (`interview_id`,`ordinal`);--> statement-breakpoint
CREATE INDEX `turns_org_created_idx` ON `interview_turns` (`org_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `interviews` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`kind` text NOT NULL,
	`mode` text DEFAULT 'ai_chat' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`title` text NOT NULL,
	`focus_project_id` text,
	`focus_application_id` text,
	`agenda` text DEFAULT '[]' NOT NULL,
	`covered_topics` text DEFAULT '[]' NOT NULL,
	`agenda_items` text DEFAULT '[]' NOT NULL,
	`transcript_document_id` text,
	`summary` text,
	`fact_count` integer DEFAULT 0 NOT NULL,
	`created_by` text,
	`completed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`focus_project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`transcript_document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `interviews_org_idx` ON `interviews` (`org_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `interviews_transcript_doc_idx` ON `interviews` (`transcript_document_id`);--> statement-breakpoint
CREATE INDEX `interviews_focus_project_idx` ON `interviews` (`focus_project_id`);--> statement-breakpoint
CREATE TABLE `document_chunks` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`document_id` text NOT NULL,
	`ordinal` integer NOT NULL,
	`heading` text,
	`text` text NOT NULL,
	`token_estimate` integer NOT NULL,
	`char_start` integer NOT NULL,
	`char_end` integer NOT NULL,
	`embedded_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `chunks_doc_idx` ON `document_chunks` (`document_id`,`ordinal`);--> statement-breakpoint
CREATE INDEX `chunks_org_idx` ON `document_chunks` (`org_id`);--> statement-breakpoint
CREATE TABLE `documents` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`uploaded_by` text,
	`title` text NOT NULL,
	`kind` text NOT NULL,
	`mime_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`sha256` text NOT NULL,
	`r2_key` text NOT NULL,
	`text_r2_key` text,
	`source_url` text,
	`status` text DEFAULT 'uploaded' NOT NULL,
	`error` text,
	`chunk_count` integer DEFAULT 0 NOT NULL,
	`fact_count` integer DEFAULT 0 NOT NULL,
	`past_outcome` text,
	`past_funder` text,
	`past_amount_cents` integer,
	`past_year` integer,
	`notes` text,
	`safety_flags` text,
	`consent_record_id` text,
	`processed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`uploaded_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `documents_org_idx` ON `documents` (`org_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `documents_org_sha_idx` ON `documents` (`org_id`,`sha256`);--> statement-breakpoint
CREATE TABLE `facts` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`category` text NOT NULL,
	`statement` text NOT NULL,
	`value` text,
	`status` text DEFAULT 'proposed' NOT NULL,
	`sensitivity` text DEFAULT 'internal' NOT NULL,
	`confidence` real DEFAULT 0.5 NOT NULL,
	`source_type` text NOT NULL,
	`source_document_id` text,
	`source_chunk_id` text,
	`source_interview_id` text,
	`source_turn_id` text,
	`source_quote` text DEFAULT '' NOT NULL,
	`as_of` text,
	`project_id` text,
	`superseded_by_id` text,
	`supersedes_fact_id` text,
	`last_confirmed_at` integer,
	`created_by` text,
	`confirmed_by` text,
	`confirmed_at` integer,
	`original_statement` text,
	`edited_by` text,
	`edited_at` integer,
	`rejection_reason` text,
	`project_field` text,
	`dedupe_hash` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_chunk_id`) REFERENCES `document_chunks`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`confirmed_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`edited_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `facts_project_idx` ON `facts` (`project_id`);--> statement-breakpoint
CREATE INDEX `facts_interview_idx` ON `facts` (`source_interview_id`);--> statement-breakpoint
CREATE INDEX `facts_org_status_idx` ON `facts` (`org_id`,`status`);--> statement-breakpoint
CREATE INDEX `facts_org_category_idx` ON `facts` (`org_id`,`category`);--> statement-breakpoint
CREATE INDEX `facts_doc_idx` ON `facts` (`source_document_id`);--> statement-breakpoint
CREATE INDEX `facts_org_created_idx` ON `facts` (`org_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `facts_chunk_idx` ON `facts` (`source_chunk_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `facts_org_dedupe_uq` ON `facts` (`org_id`,`dedupe_hash`);--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`title` text NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`problem` text DEFAULT '' NOT NULL,
	`approach` text DEFAULT '' NOT NULL,
	`population_served` text DEFAULT '' NOT NULL,
	`location` text DEFAULT '' NOT NULL,
	`budget_needed_cents` integer,
	`timeline_start` text,
	`timeline_end` text,
	`status` text DEFAULT 'idea' NOT NULL,
	`priority` integer DEFAULT 3 NOT NULL,
	`created_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `projects_org_idx` ON `projects` (`org_id`);--> statement-breakpoint
CREATE TABLE `notification_preferences` (
	`user_id` text NOT NULL,
	`org_id` text NOT NULL,
	`kind` text NOT NULL,
	`in_app` integer DEFAULT true NOT NULL,
	`email` integer DEFAULT false NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `org_id`, `kind`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`link` text,
	`severity` text DEFAULT 'info' NOT NULL,
	`dedupe_key` text,
	`read_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "notifications_link_app_path" CHECK("notifications"."link" is null or (substr("notifications"."link", 1, 1) = '/' and instr("notifications"."link", '//') = 0)),
	CONSTRAINT "notifications_severity" CHECK("notifications"."severity" in ('info', 'success', 'warning', 'action'))
);
--> statement-breakpoint
CREATE INDEX `notifications_user_org_read_created_idx` ON `notifications` (`user_id`,`org_id`,`read_at`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `notifications_user_org_dedupe_uq` ON `notifications` (`user_id`,`org_id`,`dedupe_key`);--> statement-breakpoint
CREATE TABLE `discovery_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`source` text NOT NULL,
	`trigger` text NOT NULL,
	`status` text NOT NULL,
	`query` text,
	`found` integer DEFAULT 0 NOT NULL,
	`created` integer DEFAULT 0 NOT NULL,
	`updated` integer DEFAULT 0 NOT NULL,
	`error` text,
	`started_at` integer NOT NULL,
	`finished_at` integer
);
--> statement-breakpoint
CREATE TABLE `funders` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`normalized_name` text NOT NULL,
	`type` text DEFAULT 'other' NOT NULL,
	`website_url` text,
	`ein` text,
	`agency_code` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `funders_normalized_uq` ON `funders` (`normalized_name`);--> statement-breakpoint
CREATE TABLE `opportunities` (
	`id` text PRIMARY KEY NOT NULL,
	`source` text NOT NULL,
	`source_id` text NOT NULL,
	`source_url` text,
	`private_to_org_id` text,
	`funder_id` text,
	`funder_name` text NOT NULL,
	`title` text NOT NULL,
	`opportunity_number` text,
	`summary` text DEFAULT '' NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`eligibility_text` text DEFAULT '' NOT NULL,
	`applicant_types` text DEFAULT '[]' NOT NULL,
	`categories` text DEFAULT '[]' NOT NULL,
	`keywords` text DEFAULT '[]' NOT NULL,
	`geographic_scope` text,
	`award_floor_cents` integer,
	`award_ceiling_cents` integer,
	`total_funding_cents` integer,
	`expected_awards` integer,
	`cost_sharing_required` integer,
	`open_date` integer,
	`close_date` integer,
	`estimated_post_date` integer,
	`estimated_close_date` integer,
	`status` text DEFAULT 'posted' NOT NULL,
	`requirements` text,
	`submission_method` text DEFAULT 'unknown' NOT NULL,
	`submission_email` text,
	`submission_email_verified` integer DEFAULT false NOT NULL,
	`submission_url` text,
	`raw_r2_key` text,
	`source_safety_flags` text,
	`content_hash` text,
	`fetched_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`private_to_org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`funder_id`) REFERENCES `funders`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `opportunities_source_uq` ON `opportunities` (`source`,`source_id`);--> statement-breakpoint
CREATE INDEX `opportunities_close_idx` ON `opportunities` (`status`,`close_date`);--> statement-breakpoint
CREATE INDEX `opportunities_private_idx` ON `opportunities` (`private_to_org_id`);--> statement-breakpoint
CREATE TABLE `opportunity_matches` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`opportunity_id` text NOT NULL,
	`project_id` text,
	`eligibility` text DEFAULT 'unknown' NOT NULL,
	`fit_score` integer DEFAULT 0 NOT NULL,
	`likelihood` real DEFAULT 0 NOT NULL,
	`suggested_ask_cents` integer,
	`expected_value_cents` integer DEFAULT 0 NOT NULL,
	`effort_hours` real,
	`reasons` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'new' NOT NULL,
	`dismiss_reason` text,
	`dismiss_note` text,
	`model` text,
	`scored_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`opportunity_id`) REFERENCES `opportunities`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `matches_org_opp_uq` ON `opportunity_matches` (`org_id`,`opportunity_id`);--> statement-breakpoint
CREATE INDEX `matches_org_rank_idx` ON `opportunity_matches` (`org_id`,`status`,`expected_value_cents`);--> statement-breakpoint
CREATE INDEX `matches_org_ev_idx` ON `opportunity_matches` (`org_id`,`expected_value_cents`,`fit_score`);--> statement-breakpoint
CREATE INDEX `matches_opp_idx` ON `opportunity_matches` (`opportunity_id`);--> statement-breakpoint
CREATE INDEX `matches_project_idx` ON `opportunity_matches` (`project_id`);--> statement-breakpoint
CREATE TABLE `llm_calls` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text,
	`purpose` text NOT NULL,
	`model` text NOT NULL,
	`input_tokens` integer DEFAULT 0 NOT NULL,
	`output_tokens` integer DEFAULT 0 NOT NULL,
	`cache_read_tokens` integer DEFAULT 0 NOT NULL,
	`cache_write_tokens` integer DEFAULT 0 NOT NULL,
	`cost_micros` integer DEFAULT 0 NOT NULL,
	`application_id` text,
	`latency_ms` integer DEFAULT 0 NOT NULL,
	`stop_reason` text,
	`error` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `llm_calls_org_idx` ON `llm_calls` (`org_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `llm_calls_app_idx` ON `llm_calls` (`application_id`);--> statement-breakpoint
CREATE INDEX `llm_calls_created_idx` ON `llm_calls` (`created_at`,`cost_micros`);--> statement-breakpoint
CREATE INDEX `llm_calls_org_cost_idx` ON `llm_calls` (`org_id`,`created_at`,`cost_micros`);--> statement-breakpoint
CREATE TABLE `org_profiles` (
	`org_id` text PRIMARY KEY NOT NULL,
	`legal_name` text NOT NULL,
	`dba` text,
	`org_type` text DEFAULT 'nonprofit_501c3' NOT NULL,
	`ein` text,
	`uei` text,
	`website_url` text,
	`address_line1` text,
	`address_line2` text,
	`city` text,
	`state` text,
	`postal_code` text,
	`country` text DEFAULT 'US' NOT NULL,
	`contact_name` text,
	`contact_email` text,
	`contact_phone` text,
	`founded_year` integer,
	`focus_areas` text DEFAULT '[]' NOT NULL,
	`service_areas` text DEFAULT '[]' NOT NULL,
	`onboarding_completed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `org_settings` (
	`org_id` text PRIMARY KEY NOT NULL,
	`autopilot_enabled` integer DEFAULT false NOT NULL,
	`auto_submit_max_cents` integer DEFAULT 1000000 NOT NULL,
	`full_review_above_cents` integer DEFAULT 10000000 NOT NULL,
	`min_fit_score_for_auto` integer DEFAULT 80 NOT NULL,
	`high_likelihood_threshold` real DEFAULT 0.6 NOT NULL,
	`review_first_submission_per_funder` integer DEFAULT true NOT NULL,
	`max_auto_submissions_per_month` integer DEFAULT 5 NOT NULL,
	`allow_unconfirmed_facts_in_drafts` integer DEFAULT true NOT NULL,
	`auto_draft_top_n` integer DEFAULT 3 NOT NULL,
	`automation_level` text,
	`require_match_approval` integer,
	`require_fact_confirmation` integer,
	`require_draft_review` integer,
	`require_submission_approval` integer,
	`require_followup_approval` integer,
	`two_person_rule_above_cents` integer,
	`notify_emails` text DEFAULT '[]' NOT NULL,
	`allow_website_crawl` integer DEFAULT false NOT NULL,
	`store_voice_recordings` integer DEFAULT false NOT NULL,
	`raw_file_retention_days` integer,
	`data_policy_version` text,
	`data_policy_accepted_at` integer,
	`data_policy_accepted_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`data_policy_accepted_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text,
	`actor_type` text NOT NULL,
	`actor_id` text,
	`action` text NOT NULL,
	`target_type` text,
	`target_id` text,
	`metadata` text,
	`request_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `audit_org_idx` ON `audit_log` (`org_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `consent_records` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`user_id` text,
	`scope` text NOT NULL,
	`policy_version` text NOT NULL,
	`granted` integer NOT NULL,
	`ip_hash` text,
	`user_agent` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `consent_org_scope_idx` ON `consent_records` (`org_id`,`scope`,`created_at`);--> statement-breakpoint
CREATE TABLE `data_exports` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`requested_by` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`r2_key` text,
	`error` text,
	`expires_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`requested_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `data_exports_org_idx` ON `data_exports` (`org_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `purged_files` (
	`r2_key` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`purged_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `purged_files_org_idx` ON `purged_files` (`org_id`,`target_type`);--> statement-breakpoint
CREATE TABLE `funder_profiles` (
	`ein` text PRIMARY KEY NOT NULL,
	`source` text DEFAULT 'propublica' NOT NULL,
	`name` text NOT NULL,
	`city` text,
	`state` text,
	`ntee_code` text,
	`subsection_code` integer,
	`foundation_type` text DEFAULT 'unknown' NOT NULL,
	`latest_filing_year` integer,
	`latest_form_type` integer,
	`total_assets_cents` integer,
	`total_giving_cents` integer,
	`website` text,
	`propublica_url` text,
	`raw_r2_key` text,
	`fetched_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `funder_profiles_state_idx` ON `funder_profiles` (`state`,`foundation_type`);--> statement-breakpoint
CREATE TABLE `org_prospects` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`ein` text NOT NULL,
	`fit_score` integer DEFAULT 0 NOT NULL,
	`reasons` text DEFAULT '[]' NOT NULL,
	`approach` text DEFAULT 'research_first' NOT NULL,
	`approach_notes` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'new' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`next_step_at` integer,
	`score_input_hash` text,
	`scored_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`ein`) REFERENCES `funder_profiles`(`ein`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `org_prospects_org_ein_uq` ON `org_prospects` (`org_id`,`ein`);--> statement-breakpoint
CREATE INDEX `org_prospects_org_rank_idx` ON `org_prospects` (`org_id`,`status`,`fit_score`);--> statement-breakpoint
CREATE TABLE `prospect_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`status` text NOT NULL,
	`requested_by` text,
	`counts` text,
	`error` text,
	`started_at` integer NOT NULL,
	`finished_at` integer,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `prospect_runs_org_idx` ON `prospect_runs` (`org_id`,`started_at`);--> statement-breakpoint
CREATE TABLE `application_quality` (
	`version_id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`application_id` text NOT NULL,
	`report` text NOT NULL,
	`model` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`version_id`) REFERENCES `application_versions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `quality_app_idx` ON `application_quality` (`application_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `quality_org_idx` ON `application_quality` (`org_id`);--> statement-breakpoint
CREATE TABLE `followups` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`application_id` text,
	`submission_id` text,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`due_at` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`notified_at` integer,
	`completed_at` integer,
	`completed_by` text,
	`dedupe_key` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`submission_id`) REFERENCES `submissions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`completed_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `followups_due_idx` ON `followups` (`status`,`due_at`);--> statement-breakpoint
CREATE INDEX `followups_org_idx` ON `followups` (`org_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `followups_dedupe_uq` ON `followups` (`org_id`,`dedupe_key`);--> statement-breakpoint
CREATE INDEX `followups_org_status_due_idx` ON `followups` (`org_id`,`status`,`due_at`);--> statement-breakpoint
CREATE INDEX `followups_submission_idx` ON `followups` (`submission_id`);--> statement-breakpoint
CREATE INDEX `followups_app_idx` ON `followups` (`application_id`);--> statement-breakpoint
CREATE TABLE `submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`application_id` text NOT NULL,
	`version_id` text NOT NULL,
	`channel` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`package_r2_key` text NOT NULL,
	`package_sha256` text NOT NULL,
	`recipient` text,
	`external_ref` text,
	`submitted_by_type` text NOT NULL,
	`submitted_by` text,
	`approved_by` text,
	`metadata` text,
	`error` text,
	`sent_at` integer,
	`confirmed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`version_id`) REFERENCES `application_versions`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`submitted_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`approved_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `submissions_org_idx` ON `submissions` (`org_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `submissions_app_idx` ON `submissions` (`application_id`);--> statement-breakpoint
CREATE INDEX `submissions_version_idx` ON `submissions` (`version_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `submissions_live_version_uq` ON `submissions` (`application_id`,`version_id`) WHERE "submissions"."status" != 'failed';--> statement-breakpoint
CREATE TABLE `watch_events` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text NOT NULL,
	`org_id` text,
	`kind` text NOT NULL,
	`opportunity_id` text,
	`summary` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`source_id`) REFERENCES `watch_sources`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`opportunity_id`) REFERENCES `opportunities`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `watch_events_org_idx` ON `watch_events` (`org_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `watch_events_source_idx` ON `watch_events` (`source_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `watch_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text,
	`url` text NOT NULL,
	`host` text NOT NULL,
	`label` text,
	`funder_name` text,
	`kind` text DEFAULT 'rfp_page' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`check_interval_hours` integer DEFAULT 24 NOT NULL,
	`next_check_at` integer,
	`last_checked_at` integer,
	`last_manual_check_at` integer,
	`last_changed_at` integer,
	`etag` text,
	`last_modified` text,
	`content_hash` text,
	`consecutive_errors` integer DEFAULT 0 NOT NULL,
	`last_error` text,
	`created_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `watch_sources_org_idx` ON `watch_sources` (`org_id`);--> statement-breakpoint
CREATE INDEX `watch_sources_due_idx` ON `watch_sources` (`status`,`next_check_at`);--> statement-breakpoint
CREATE INDEX `watch_sources_host_idx` ON `watch_sources` (`host`,`last_checked_at`);