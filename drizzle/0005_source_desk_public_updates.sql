CREATE TABLE `source_desk_review_events` (
  `id` text PRIMARY KEY NOT NULL,
  `submission_id` text NOT NULL,
  `from_status` text NOT NULL,
  `to_status` text NOT NULL,
  `review_note` text DEFAULT '' NOT NULL,
  `public_summary` text DEFAULT '' NOT NULL,
  `publish_changelog` integer DEFAULT 0 NOT NULL,
  `created_at` integer NOT NULL
);
CREATE TABLE `source_desk_public_updates` (
  `id` text PRIMARY KEY NOT NULL,
  `submission_id` text NOT NULL UNIQUE,
  `request_type` text NOT NULL,
  `subject_name` text NOT NULL,
  `subject_url` text DEFAULT '' NOT NULL,
  `source_url` text NOT NULL,
  `public_summary` text NOT NULL,
  `published_at` integer NOT NULL
);
