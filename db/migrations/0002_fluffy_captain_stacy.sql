ALTER TYPE "public"."intent_status" ADD VALUE 'needs_review';--> statement-breakpoint
ALTER TABLE "attempts" ADD COLUMN "reverify_count" integer DEFAULT 0 NOT NULL;