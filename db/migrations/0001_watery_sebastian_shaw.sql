CREATE TABLE `notes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`userId` integer NOT NULL,
	`parentId` integer,
	`kind` text DEFAULT 'note' NOT NULL,
	`title` text NOT NULL,
	`content` text DEFAULT '' NOT NULL,
	`items` text DEFAULT '[]' NOT NULL,
	`sortOrder` integer DEFAULT 0 NOT NULL,
	`createdAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updatedAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `notes_user_parent_idx` ON `notes` (`userId`,`parentId`);--> statement-breakpoint
CREATE INDEX `notes_user_order_idx` ON `notes` (`userId`,`sortOrder`,`id`);