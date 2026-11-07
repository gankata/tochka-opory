CREATE TABLE `authSessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`userId` integer NOT NULL,
	`tokenHash` text NOT NULL,
	`expiresAt` integer NOT NULL,
	`lastSeenAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`createdAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `authSessions_tokenHash_unique` ON `authSessions` (`tokenHash`);--> statement-breakpoint
CREATE INDEX `auth_sessions_user_idx` ON `authSessions` (`userId`,`expiresAt`);--> statement-breakpoint
CREATE TABLE `localAuth` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`userId` integer NOT NULL,
	`username` text NOT NULL,
	`passwordHash` text NOT NULL,
	`passwordSalt` text NOT NULL,
	`createdAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updatedAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `localAuth_userId_unique` ON `localAuth` (`userId`);--> statement-breakpoint
CREATE UNIQUE INDEX `localAuth_username_unique` ON `localAuth` (`username`);--> statement-breakpoint
CREATE TABLE `noteAssets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`userId` integer NOT NULL,
	`noteId` integer NOT NULL,
	`name` text NOT NULL,
	`mime` text NOT NULL,
	`data` blob NOT NULL,
	`createdAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `note_assets_user_note_idx` ON `noteAssets` (`userId`,`noteId`);--> statement-breakpoint
ALTER TABLE `notes` ADD `document` text;