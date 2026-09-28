ALTER TABLE `organizations` ADD COLUMN `verification_status` text NOT NULL DEFAULT 'submitted';
--> statement-breakpoint
ALTER TABLE `organizations` ADD COLUMN `updated_at` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
UPDATE `organizations` SET `updated_at` = `created_at` WHERE `updated_at` = 0;
