CREATE TABLE `importBatches` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`userId` integer NOT NULL,
	`name` text NOT NULL,
	`format` text NOT NULL,
	`rowCount` integer NOT NULL,
	`duplicateCount` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`createdAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`rolledBackAt` integer
);
--> statement-breakpoint
CREATE INDEX `import_batches_user_date_idx` ON `importBatches` (`userId`,`createdAt`);--> statement-breakpoint
CREATE TABLE `transactionRules` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`userId` integer NOT NULL,
	`name` text NOT NULL,
	`matchField` text DEFAULT 'any' NOT NULL,
	`pattern` text NOT NULL,
	`operationType` text DEFAULT 'Любой' NOT NULL,
	`category` text NOT NULL,
	`priority` integer DEFAULT 100 NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`createdAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updatedAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `transaction_rules_user_priority_idx` ON `transactionRules` (`userId`,`enabled`,`priority`,`id`);--> statement-breakpoint
ALTER TABLE `transactions` ADD `importBatchId` integer;--> statement-breakpoint
ALTER TABLE `transactions` ADD `externalId` text;--> statement-breakpoint
ALTER TABLE `transactions` ADD `clientId` text;--> statement-breakpoint
CREATE INDEX `transactions_user_batch_idx` ON `transactions` (`userId`,`importBatchId`);--> statement-breakpoint
CREATE INDEX `transactions_user_external_idx` ON `transactions` (`userId`,`externalId`);--> statement-breakpoint
CREATE UNIQUE INDEX `transactions_user_client_unique` ON `transactions` (`userId`,`clientId`);