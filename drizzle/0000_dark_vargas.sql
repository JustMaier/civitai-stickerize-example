CREATE TABLE `characters` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`additional_details` text,
	`sticker_image_url` text NOT NULL,
	`gemini_file_id` text,
	`gemini_file_expiry` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `generation_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`type` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`user_prompt` text NOT NULL,
	`refined_prompt` text,
	`character_ids` text,
	`chroma_key_color` text,
	`result_id` text,
	`error` text,
	`is_retryable` integer,
	`attempts` integer DEFAULT 0 NOT NULL,
	`checkpoint` text,
	`temp_generated_image` text,
	`llm_cost_cents` integer,
	`image_cost_cents` integer,
	`buzz_cost` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `stickers` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`user_id` text NOT NULL,
	`character_ids` text DEFAULT '[]' NOT NULL,
	`prompt` text NOT NULL,
	`image_url` text NOT NULL,
	`cost_cents` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`profile_photo_url` text,
	`oauth_provider` text,
	`oauth_id` text,
	`civitai_tokens` text,
	`has_received_welcome_sticker` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);