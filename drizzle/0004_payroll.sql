CREATE TYPE "public"."payslip_status" AS ENUM('draft', 'approved', 'paid');--> statement-breakpoint
CREATE TYPE "public"."timesheet_status" AS ENUM('draft', 'submitted', 'acknowledged');--> statement-breakpoint
CREATE TABLE "holidays" (
	"date" date PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"multiplier" numeric(3, 1) DEFAULT 3 NOT NULL,
	CONSTRAINT "holidays_multiplier_check" CHECK ("holidays"."multiplier" >= 1 AND "holidays"."multiplier" <= 5)
);
--> statement-breakpoint
ALTER TABLE "holidays" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "pay_rates" (
	"id" serial PRIMARY KEY NOT NULL,
	"staff_id" integer NOT NULL,
	"hourly_rate" integer NOT NULL,
	"effective_from" date NOT NULL,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pay_rates_staff_from" UNIQUE("staff_id","effective_from"),
	CONSTRAINT "pay_rates_rate_check" CHECK ("pay_rates"."hourly_rate" > 0)
);
--> statement-breakpoint
ALTER TABLE "pay_rates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "payslips" (
	"id" serial PRIMARY KEY NOT NULL,
	"staff_id" integer NOT NULL,
	"period" text NOT NULL,
	"timesheet_id" integer NOT NULL,
	"lines" jsonb NOT NULL,
	"meta" jsonb,
	"total" integer NOT NULL,
	"status" "payslip_status" DEFAULT 'draft' NOT NULL,
	"approved_by" integer,
	"approved_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"paid_method" text,
	"staff_ack_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payslips_staff_period" UNIQUE("staff_id","period"),
	CONSTRAINT "payslips_total_check" CHECK ("payslips"."total" >= 0),
	CONSTRAINT "payslips_paid_check" CHECK (("payslips"."status" = 'paid') = ("payslips"."paid_at" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "payslips" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "shift_plans" (
	"id" serial PRIMARY KEY NOT NULL,
	"staff_id" integer NOT NULL,
	"date" date NOT NULL,
	"start" time NOT NULL,
	"end" time NOT NULL,
	CONSTRAINT "shift_plans_staff_date" UNIQUE("staff_id","date"),
	CONSTRAINT "shift_plans_time_check" CHECK ("shift_plans"."end" > "shift_plans"."start")
);
--> statement-breakpoint
ALTER TABLE "shift_plans" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "time_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"staff_id" integer NOT NULL,
	"clock_in" timestamp with time zone NOT NULL,
	"clock_out" timestamp with time zone,
	"in_ip" text,
	"out_ip" text,
	"flags" text[] DEFAULT '{}'::text[] NOT NULL,
	"edit_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "time_entries_order_check" CHECK ("time_entries"."clock_out" IS NULL OR "time_entries"."clock_out" >= "time_entries"."clock_in")
);
--> statement-breakpoint
ALTER TABLE "time_entries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "timesheets" (
	"id" serial PRIMARY KEY NOT NULL,
	"staff_id" integer NOT NULL,
	"period" text NOT NULL,
	"status" timesheet_status DEFAULT 'draft' NOT NULL,
	"minutes" integer DEFAULT 0 NOT NULL,
	"night_minutes" integer DEFAULT 0 NOT NULL,
	"overtime_minutes" integer DEFAULT 0 NOT NULL,
	"holiday_minutes" integer DEFAULT 0 NOT NULL,
	"late_count" integer DEFAULT 0 NOT NULL,
	"snapshot" jsonb,
	"snapshot_hash" text,
	"submitted_by" integer,
	"submitted_at" timestamp with time zone,
	"ack_at" timestamp with time zone,
	"ack_ip" text,
	"ack_device" text,
	"dispute_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "timesheets_staff_period" UNIQUE("staff_id","period"),
	CONSTRAINT "timesheets_period_check" CHECK ("timesheets"."period" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
	CONSTRAINT "timesheets_snapshot_check" CHECK (("timesheets"."status" = 'draft') = ("timesheets"."snapshot" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "timesheets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "pay_rates" ADD CONSTRAINT "pay_rates_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pay_rates" ADD CONSTRAINT "pay_rates_created_by_staff_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_timesheet_id_timesheets_id_fk" FOREIGN KEY ("timesheet_id") REFERENCES "public"."timesheets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_approved_by_staff_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_plans" ADD CONSTRAINT "shift_plans_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timesheets" ADD CONSTRAINT "timesheets_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timesheets" ADD CONSTRAINT "timesheets_submitted_by_staff_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "time_entries_staff_id_clock_in_index" ON "time_entries" USING btree ("staff_id","clock_in");--> statement-breakpoint
CREATE UNIQUE INDEX "time_entries_one_open" ON "time_entries" USING btree ("staff_id") WHERE "time_entries"."clock_out" IS NULL;