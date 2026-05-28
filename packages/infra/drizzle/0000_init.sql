CREATE TABLE IF NOT EXISTS "agent_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"version" text NOT NULL,
	"phase" text NOT NULL,
	"model_preference" text NOT NULL,
	"fallback_model" text,
	"allowed_tools" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"max_risk_level" text DEFAULT 'R1' NOT NULL,
	"prompt_template" jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"config" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "agent_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" text NOT NULL,
	"agent_id" text NOT NULL,
	"user_id" text NOT NULL,
	"status" text DEFAULT 'created' NOT NULL,
	"correlation_id" text NOT NULL,
	"input" jsonb,
	"output" jsonb,
	"metadata" jsonb,
	"tokens_used" integer DEFAULT 0,
	"cost_usd" text DEFAULT '0',
	"turns_executed" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "approval_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" text NOT NULL,
	"run_id" uuid NOT NULL,
	"tool_name" text NOT NULL,
	"tool_params" jsonb NOT NULL,
	"risk_level" text NOT NULL,
	"reason" text NOT NULL,
	"approvers" jsonb NOT NULL,
	"required_approvals" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"decided_by" text,
	"deadline" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"decided_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" text NOT NULL,
	"run_id" uuid,
	"agent_id" text,
	"user_id" text,
	"event_type" text NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "checkpoints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" text NOT NULL,
	"run_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"turn_count" integer NOT NULL,
	"messages" jsonb NOT NULL,
	"budget" jsonb NOT NULL,
	"environment_state" jsonb,
	"evidence_registry" jsonb,
	"session_summary_version" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "connectors" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"name" text NOT NULL,
	"platform" text NOT NULL,
	"protocol" text NOT NULL,
	"endpoint" text NOT NULL,
	"auth_method" text NOT NULL,
	"secret_ref" text,
	"capabilities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"data_classification" text DEFAULT 'internal' NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "evidence_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"run_id" uuid NOT NULL,
	"source_tool_call" text NOT NULL,
	"message_index" integer NOT NULL,
	"type" text NOT NULL,
	"content" text NOT NULL,
	"turn_created" integer NOT NULL,
	"access_count" integer DEFAULT 0 NOT NULL,
	"token_count" integer NOT NULL,
	"was_referenced" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "installed_packs" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"name" text NOT NULL,
	"version" text NOT NULL,
	"status" text NOT NULL,
	"manifest" jsonb NOT NULL,
	"installed_at" timestamp DEFAULT now() NOT NULL,
	"enabled_at" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "phase_bridge_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" text NOT NULL,
	"source" text NOT NULL,
	"target" text,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"correlation_id" text NOT NULL,
	"causation_id" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"schema_version" text DEFAULT '1.0' NOT NULL,
	"actor" jsonb NOT NULL,
	"data_classification" text DEFAULT 'internal' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "phase_bridge_events_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "session_summaries" (
	"run_id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"turn_start" integer DEFAULT 0 NOT NULL,
	"turn_end" integer DEFAULT 0 NOT NULL,
	"progress_summary" text DEFAULT '' NOT NULL,
	"confirmed_decisions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"open_questions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"active_evidence_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"token_count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "skills" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"l0_summary" text NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"evidence_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"data_classification" text DEFAULT 'internal' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
