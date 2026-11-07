CREATE TABLE `activities` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`userId` integer NOT NULL,
	`action` text NOT NULL,
	`entityType` text NOT NULL,
	`entityId` integer,
	`summary` text NOT NULL,
	`createdAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `activities_user_date_idx` ON `activities` (`userId`,`createdAt`);--> statement-breakpoint
CREATE TABLE `appSettings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`userId` integer NOT NULL,
	`startDate` text NOT NULL,
	`cashRub` real DEFAULT 0 NOT NULL,
	`cardRub` real DEFAULT 0 NOT NULL,
	`cashUsd` real DEFAULT 0 NOT NULL,
	`usdRate` real DEFAULT 83.25 NOT NULL,
	`reserveMonths` integer DEFAULT 3 NOT NULL,
	`salaryDay` integer DEFAULT 15 NOT NULL,
	`mode` text DEFAULT 'Обычный' NOT NULL,
	`savingPercent` integer DEFAULT 30 NOT NULL,
	`trackingDays` integer DEFAULT 14 NOT NULL,
	`incomeStrategy` text DEFAULT 'Худший месяц' NOT NULL,
	`statsMonths` integer DEFAULT 6 NOT NULL,
	`walletDays` integer DEFAULT 3 NOT NULL,
	`largeExpenseThreshold` real DEFAULT 10000 NOT NULL,
	`currencyRates` text,
	`currencyBalances` text,
	`createdAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updatedAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `appSettings_userId_unique` ON `appSettings` (`userId`);--> statement-breakpoint
CREATE TABLE `backups` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`userId` integer NOT NULL,
	`name` text NOT NULL,
	`kind` text DEFAULT 'manual' NOT NULL,
	`payload` text NOT NULL,
	`createdAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `backups_user_date_idx` ON `backups` (`userId`,`createdAt`);--> statement-breakpoint
CREATE TABLE `envelopes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`userId` integer NOT NULL,
	`name` text NOT NULL,
	`required` integer DEFAULT false NOT NULL,
	`estimatedAmount` real,
	`monthlyLimit` real,
	`sortOrder` integer DEFAULT 0 NOT NULL,
	`note` text,
	`createdAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updatedAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `envelopes_user_idx` ON `envelopes` (`userId`);--> statement-breakpoint
CREATE TABLE `goals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`userId` integer NOT NULL,
	`name` text NOT NULL,
	`targetAmount` real NOT NULL,
	`savedAmount` real DEFAULT 0 NOT NULL,
	`targetDate` text,
	`createdAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updatedAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `goals_user_idx` ON `goals` (`userId`);--> statement-breakpoint
CREATE TABLE `moodEntries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`userId` integer NOT NULL,
	`entryDate` text NOT NULL,
	`timeOfDay` text NOT NULL,
	`mood` integer NOT NULL,
	`emotion` text NOT NULL,
	`intensity` integer NOT NULL,
	`topic` text NOT NULL,
	`situation` text,
	`thoughts` text,
	`body` text,
	`coping` text,
	`energy` integer,
	`sleepHours` real,
	`therapyNotes` text,
	`createdAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updatedAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `mood_user_date_idx` ON `moodEntries` (`userId`,`entryDate`);--> statement-breakpoint
CREATE TABLE `moodOptions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`userId` integer NOT NULL,
	`kind` text NOT NULL,
	`label` text NOT NULL,
	`sortOrder` integer DEFAULT 0 NOT NULL,
	`createdAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mood_option_unique` ON `moodOptions` (`userId`,`kind`,`label`);--> statement-breakpoint
CREATE TABLE `payments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`userId` integer NOT NULL,
	`name` text NOT NULL,
	`amount` real,
	`minAmount` real,
	`maxAmount` real,
	`intervalMonths` integer DEFAULT 1 NOT NULL,
	`required` integer DEFAULT true NOT NULL,
	`sourceType` text DEFAULT 'Данные пользователя' NOT NULL,
	`dayOfMonth` integer,
	`nextDate` text,
	`paidCycle` integer DEFAULT false NOT NULL,
	`note` text,
	`createdAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updatedAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `payments_user_idx` ON `payments` (`userId`);--> statement-breakpoint
CREATE TABLE `reconciliations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`userId` integer NOT NULL,
	`countedRub` real NOT NULL,
	`countedUsd` real NOT NULL,
	`bookRub` real NOT NULL,
	`bookUsd` real NOT NULL,
	`note` text,
	`createdAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `reconciliations_user_idx` ON `reconciliations` (`userId`);--> statement-breakpoint
CREATE TABLE `reminders` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`userId` integer NOT NULL,
	`uid` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`startAt` integer NOT NULL,
	`recurrence` text,
	`enabled` integer DEFAULT true NOT NULL,
	`createdAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updatedAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reminder_uid_unique` ON `reminders` (`userId`,`uid`);--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`userId` integer NOT NULL,
	`operationDate` text NOT NULL,
	`type` text NOT NULL,
	`category` text NOT NULL,
	`amountRub` real NOT NULL,
	`amountUsd` real,
	`currency` text DEFAULT 'RUB' NOT NULL,
	`originalAmount` real,
	`exchangeRate` real,
	`note` text,
	`source` text,
	`createdAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updatedAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `transactions_user_date_idx` ON `transactions` (`userId`,`operationDate`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`unionId` text NOT NULL,
	`name` text,
	`email` text,
	`avatar` text,
	`role` text DEFAULT 'user' NOT NULL,
	`createdAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updatedAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`lastSignInAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_unionId_unique` ON `users` (`unionId`);