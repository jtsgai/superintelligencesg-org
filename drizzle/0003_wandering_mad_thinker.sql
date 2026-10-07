CREATE TABLE `source_desk_submissions` (
  `id` text PRIMARY KEY NOT NULL,
  `request_type` text NOT NULL,
  `subject_name` text NOT NULL,
  `subject_url` text DEFAULT '' NOT NULL,
  `source_url` text NOT NULL,
  `details` text NOT NULL,
  `contact_email` text DEFAULT '' NOT NULL,
  `status` text DEFAULT 'received' NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
