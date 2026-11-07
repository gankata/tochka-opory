ALTER TABLE `notes` ADD `tags` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `notes` ADD `relatedLinks` text DEFAULT '[]' NOT NULL;