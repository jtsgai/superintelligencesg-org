CREATE TABLE `organization_details` (
	`organization_id` text PRIMARY KEY NOT NULL,
	`website_url` text DEFAULT '' NOT NULL,
	`location` text DEFAULT '' NOT NULL,
	`category` text DEFAULT 'Organization' NOT NULL,
	`collaboration` text DEFAULT 'unspecified' NOT NULL,
	`collaboration_note` text DEFAULT '' NOT NULL,
	`contact_url` text DEFAULT '' NOT NULL,
	`manage_hash` text,
	`published` integer DEFAULT 1 NOT NULL,
	`updated_at` integer,
	`verification_status` text DEFAULT 'submitted' NOT NULL,
	`verified_domain` text,
	`verified_at` integer,
	`claim_hash` text,
	`claim_challenge` text,
	`claim_expires` integer,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
