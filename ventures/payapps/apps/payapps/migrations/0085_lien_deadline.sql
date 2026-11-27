ALTER TABLE `projects` ADD `lien_state` text;--> statement-breakpoint
ALTER TABLE `projects` ADD `lien_residential` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `projects` ADD `last_furnished_on` text;--> statement-breakpoint
ALTER TABLE `projects` ADD `work_completed_on` text;--> statement-breakpoint
ALTER TABLE `projects` ADD `notice_of_completion_on` text;