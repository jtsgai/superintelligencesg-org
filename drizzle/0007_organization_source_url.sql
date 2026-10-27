-- Nullable source link on organization submissions. Existing rows stay NULL; no backfill.
ALTER TABLE `organization_details` ADD COLUMN `source_url` text;
