CREATE TABLE `file_blobs` (
	`key` text NOT NULL,
	`chunk` integer NOT NULL,
	`bytes` blob NOT NULL,
	`content_type` text,
	`custom_metadata` text,
	`size` integer NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`key`, `chunk`)
);
