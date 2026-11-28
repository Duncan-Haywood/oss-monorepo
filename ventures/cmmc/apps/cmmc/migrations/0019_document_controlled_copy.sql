ALTER TABLE `controlled_document` ADD `evidence_id` text;--> statement-breakpoint
ALTER TABLE `controlled_document_event` ADD `file_evidence_id` text;--> statement-breakpoint
ALTER TABLE `controlled_document_event` ADD `file_name` text;--> statement-breakpoint
ALTER TABLE `controlled_document_event` ADD `file_sha256` text;