CREATE TABLE "hunt_collaborators" (
	"plan_id" uuid,
	"email" text,
	CONSTRAINT "hunt_collaborators_pkey" PRIMARY KEY("plan_id","email")
);
--> statement-breakpoint
CREATE TABLE "hunt_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"owner_id" text NOT NULL,
	"name" text NOT NULL,
	"data" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "hunt_collaborators" ADD CONSTRAINT "hunt_collaborators_plan_id_hunt_plans_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "hunt_plans"("id") ON DELETE CASCADE;