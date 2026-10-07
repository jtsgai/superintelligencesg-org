ALTER TABLE `source_desk_submissions` ADD COLUMN `review_note` text DEFAULT '' NOT NULL;
ALTER TABLE `source_desk_submissions` ADD COLUMN `reviewed_at` integer;
