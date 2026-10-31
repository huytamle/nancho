CREATE TYPE "public"."checklist_moment" AS ENUM('open', 'during', 'close', 'weekly');--> statement-breakpoint
CREATE TYPE "public"."handbook_kind" AS ENUM('sop', 'recipe');--> statement-breakpoint
CREATE TABLE "checklist_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"template_id" integer NOT NULL,
	"service_date" date NOT NULL,
	"done" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "checklist_runs_template_date" UNIQUE("template_id","service_date")
);
--> statement-breakpoint
ALTER TABLE "checklist_runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "checklist_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"roles" "role"[] NOT NULL,
	"moment" "checklist_moment" NOT NULL,
	"items" jsonb NOT NULL,
	"sort" smallint DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "checklist_templates_title_check" CHECK (char_length("checklist_templates"."title") BETWEEN 1 AND 80)
);
--> statement-breakpoint
ALTER TABLE "checklist_templates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "handbook_pages" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"kind" "handbook_kind" NOT NULL,
	"roles" "role"[] NOT NULL,
	"body" text NOT NULL,
	"product_id" text,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_by" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "handbook_pages_slug_unique" UNIQUE("slug"),
	CONSTRAINT "handbook_pages_title_check" CHECK (char_length("handbook_pages"."title") BETWEEN 1 AND 80),
	CONSTRAINT "handbook_pages_body_check" CHECK (char_length("handbook_pages"."body") <= 20000)
);
--> statement-breakpoint
ALTER TABLE "handbook_pages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "checklist_runs" ADD CONSTRAINT "checklist_runs_template_id_checklist_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."checklist_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "handbook_pages" ADD CONSTRAINT "handbook_pages_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "handbook_pages" ADD CONSTRAINT "handbook_pages_updated_by_staff_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;