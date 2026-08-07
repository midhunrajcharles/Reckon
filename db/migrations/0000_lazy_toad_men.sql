CREATE TYPE "public"."discrepancy_kind" AS ENUM('reported_failed_chain_success', 'reported_success_chain_reverted', 'reported_success_not_found');--> statement-breakpoint
CREATE TYPE "public"."intent_status" AS ENUM('pending', 'executing', 'awaiting_verification', 'settled', 'blocked', 'reverted', 'unverified');--> statement-breakpoint
CREATE TYPE "public"."verified_status" AS ENUM('unchecked', 'success', 'reverted', 'not_found', 'timeout');--> statement-breakpoint
CREATE TABLE "attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"intent_id" uuid NOT NULL,
	"retry_number" integer NOT NULL,
	"trigger" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"simulation_would_revert" boolean,
	"simulation_gas_estimate" text,
	"simulation_raw" jsonb,
	"gas_limit_multiplier" text,
	"execution_id" text,
	"reported_status" text,
	"idempotent_replay" boolean DEFAULT false NOT NULL,
	"verified_status" "verified_status" DEFAULT 'unchecked' NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"verified_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "discrepancies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"intent_id" uuid NOT NULL,
	"attempt_id" uuid NOT NULL,
	"kind" "discrepancy_kind" NOT NULL,
	"reported_status" text NOT NULL,
	"verified_status" text NOT NULL,
	"detail" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "intents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" text NOT NULL,
	"chain_id" integer NOT NULL,
	"recipient_address" text NOT NULL,
	"amount" text NOT NULL,
	"token_address" text,
	"status" "intent_status" DEFAULT 'pending' NOT NULL,
	"retry_blocked" boolean DEFAULT false NOT NULL,
	"blocked_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attempt_id" uuid NOT NULL,
	"tx_hash" text NOT NULL,
	"status" text NOT NULL,
	"block_number" text,
	"block_hash" text,
	"from_address" text,
	"to_address" text,
	"gas_used" text,
	"raw" jsonb NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_intent_id_intents_id_fk" FOREIGN KEY ("intent_id") REFERENCES "public"."intents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discrepancies" ADD CONSTRAINT "discrepancies_intent_id_intents_id_fk" FOREIGN KEY ("intent_id") REFERENCES "public"."intents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discrepancies" ADD CONSTRAINT "discrepancies_attempt_id_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."attempts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_attempt_id_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."attempts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attempts_intent_id_idx" ON "attempts" USING btree ("intent_id");--> statement-breakpoint
CREATE INDEX "attempts_idempotency_key_idx" ON "attempts" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "discrepancies_intent_id_idx" ON "discrepancies" USING btree ("intent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "intents_task_id_idx" ON "intents" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "receipts_attempt_id_idx" ON "receipts" USING btree ("attempt_id");--> statement-breakpoint
CREATE INDEX "receipts_tx_hash_idx" ON "receipts" USING btree ("tx_hash");