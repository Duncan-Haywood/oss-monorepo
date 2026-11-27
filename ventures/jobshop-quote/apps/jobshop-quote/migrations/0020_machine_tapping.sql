ALTER TABLE `rfq_parts` ADD `tapped_hole_diameters_in` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `machines` ADD `seconds_per_tapped_hole` real;