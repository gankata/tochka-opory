CREATE TABLE `incomeSources` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`userId` integer NOT NULL,
	`name` text NOT NULL,
	`dayOfMonth` integer,
	`sortOrder` integer DEFAULT 0 NOT NULL,
	`createdAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updatedAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `income_sources_user_order_idx` ON `incomeSources` (`userId`,`sortOrder`,`id`);--> statement-breakpoint
INSERT INTO `incomeSources` (`userId`, `name`, `dayOfMonth`, `sortOrder`)
SELECT `userId`, CASE WHEN `incomeSchedule` = 'monthly' THEN 'Зарплата' ELSE 'Первая зарплата' END, `salaryDay`, 0
FROM `appSettings` WHERE `incomeSchedule` <> 'irregular';--> statement-breakpoint
INSERT INTO `incomeSources` (`userId`, `name`, `dayOfMonth`, `sortOrder`)
SELECT `userId`, 'Вторая зарплата', `secondSalaryDay`, 1
FROM `appSettings` WHERE `incomeSchedule` = 'twice';