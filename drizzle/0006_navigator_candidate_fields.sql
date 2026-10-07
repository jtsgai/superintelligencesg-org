ALTER TABLE `source_desk_submissions` ADD COLUMN `navigator_candidate_status` text DEFAULT 'none' NOT NULL;
ALTER TABLE `source_desk_submissions` ADD COLUMN `navigator_candidate_name` text DEFAULT '' NOT NULL;
ALTER TABLE `source_desk_submissions` ADD COLUMN `navigator_candidate_founder` text DEFAULT '' NOT NULL;
ALTER TABLE `source_desk_submissions` ADD COLUMN `navigator_candidate_description` text DEFAULT '' NOT NULL;
ALTER TABLE `source_desk_submissions` ADD COLUMN `navigator_candidate_kind` text DEFAULT 'Organization' NOT NULL;
ALTER TABLE `source_desk_submissions` ADD COLUMN `navigator_candidate_logo_url` text DEFAULT '' NOT NULL;
ALTER TABLE `source_desk_submissions` ADD COLUMN `navigator_candidate_updated_at` integer;
