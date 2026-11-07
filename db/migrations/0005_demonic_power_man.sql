CREATE TABLE `apiTokens` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`userId` integer NOT NULL,
	`name` text NOT NULL,
	`prefix` text NOT NULL,
	`tokenHash` text NOT NULL,
	`scope` text DEFAULT 'read' NOT NULL,
	`lastUsedAt` integer,
	`expiresAt` integer,
	`revokedAt` integer,
	`createdAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `apiTokens_tokenHash_unique` ON `apiTokens` (`tokenHash`);--> statement-breakpoint
CREATE INDEX `api_tokens_user_date_idx` ON `apiTokens` (`userId`,`createdAt`);--> statement-breakpoint
CREATE TABLE `assetEntries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`userId` integer NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`category` text NOT NULL,
	`valueRub` real NOT NULL,
	`note` text,
	`createdAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updatedAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `asset_entries_user_kind_idx` ON `assetEntries` (`userId`,`kind`,`id`);