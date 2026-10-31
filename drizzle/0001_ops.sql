CREATE TYPE "public"."cash_box" AS ENUM('register', 'petty');--> statement-breakpoint
CREATE TYPE "public"."cash_entry_kind" AS ENUM('open', 'close', 'check', 'drop', 'replenish');--> statement-breakpoint
CREATE TYPE "public"."expense_source" AS ENUM('petty', 'pocket', 'bank');--> statement-breakpoint
CREATE TYPE "public"."expense_status" AS ENUM('recorded', 'pending', 'approved', 'rejected', 'reimbursed');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('owner', 'manager', 'kitchen', 'server', 'barista', 'shipper');--> statement-breakpoint
CREATE TYPE "public"."shift_status" AS ENUM('open', 'closed');--> statement-breakpoint
CREATE TABLE "cash_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"box" "cash_box" NOT NULL,
	"kind" "cash_entry_kind" NOT NULL,
	"shift_id" integer,
	"counts" jsonb,
	"total" integer NOT NULL,
	"expected" integer,
	"staff_id" integer NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cash_entries_total_check" CHECK ("cash_entries"."total" >= 0),
	CONSTRAINT "cash_entries_counts_check" CHECK (("cash_entries"."kind" IN ('open', 'close', 'check')) = ("cash_entries"."counts" IS NOT NULL)),
	CONSTRAINT "cash_entries_box_check" CHECK (("cash_entries"."kind" <> 'replenish' OR "cash_entries"."box" = 'petty') AND ("cash_entries"."kind" NOT IN ('open', 'close', 'drop') OR "cash_entries"."box" = 'register'))
);
--> statement-breakpoint
ALTER TABLE "cash_entries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" serial PRIMARY KEY NOT NULL,
	"spent_at" timestamp with time zone NOT NULL,
	"amount" integer NOT NULL,
	"category" text NOT NULL,
	"description" text NOT NULL,
	"source" "expense_source" NOT NULL,
	"status" "expense_status" NOT NULL,
	"spent_by" integer NOT NULL,
	"approved_by" integer,
	"reimbursed_from" "expense_source",
	"reimbursed_at" timestamp with time zone,
	"replenish_id" integer,
	"photo" text,
	"telegram_file_id" text,
	"telegram_chat_id" bigint,
	"telegram_msg_id" integer,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "expenses_telegram_msg" UNIQUE("telegram_chat_id","telegram_msg_id"),
	CONSTRAINT "expenses_amount_check" CHECK ("expenses"."amount" > 0),
	CONSTRAINT "expenses_description_check" CHECK (char_length("expenses"."description") BETWEEN 1 AND 200),
	CONSTRAINT "expenses_status_check" CHECK (("expenses"."source" = 'pocket') = ("expenses"."status" <> 'recorded')),
	CONSTRAINT "expenses_reimburse_check" CHECK (("expenses"."status" = 'reimbursed') = ("expenses"."reimbursed_from" IS NOT NULL AND "expenses"."reimbursed_from" <> 'pocket'))
);
--> statement-breakpoint
ALTER TABLE "expenses" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "ops_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"actor" text NOT NULL,
	"data" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ops_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "ops_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mime" text NOT NULL,
	"bytes" "bytea" NOT NULL,
	"size" integer NOT NULL,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ops_files_size_check" CHECK ("ops_files"."size" BETWEEN 1 AND 1048576)
);
--> statement-breakpoint
ALTER TABLE "ops_files" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "shifts" (
	"id" serial PRIMARY KEY NOT NULL,
	"service_date" date NOT NULL,
	"status" "shift_status" DEFAULT 'open' NOT NULL,
	"opened_by" integer NOT NULL,
	"opened_at" timestamp with time zone NOT NULL,
	"closed_by" integer,
	"closed_at" timestamp with time zone,
	"cafe_cash" integer,
	"cafe_transfer" integer,
	"cafe_other" integer,
	"sapo_photo" text,
	"note" text,
	CONSTRAINT "shifts_cafe_check" CHECK (coalesce("shifts"."cafe_cash", 0) >= 0 AND coalesce("shifts"."cafe_transfer", 0) >= 0 AND coalesce("shifts"."cafe_other", 0) >= 0),
	CONSTRAINT "shifts_closed_check" CHECK (("shifts"."status" = 'open') = ("shifts"."closed_at" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "shifts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "telegram_updates" (
	"update_id" bigint PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "telegram_updates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "staff" ALTER COLUMN "role" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "staff" ADD COLUMN "roles" "role"[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
UPDATE "staff" SET "roles" = ARRAY["role"::text::"role"] WHERE "role" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "staff" ALTER COLUMN "roles" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "staff" ADD COLUMN "telegram_user_id" bigint;--> statement-breakpoint
ALTER TABLE "cash_entries" ADD CONSTRAINT "cash_entries_shift_id_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_entries" ADD CONSTRAINT "cash_entries_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_spent_by_staff_id_fk" FOREIGN KEY ("spent_by") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_approved_by_staff_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_replenish_id_cash_entries_id_fk" FOREIGN KEY ("replenish_id") REFERENCES "public"."cash_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ops_files" ADD CONSTRAINT "ops_files_created_by_staff_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_opened_by_staff_id_fk" FOREIGN KEY ("opened_by") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_closed_by_staff_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cash_entries_box_created_at_index" ON "cash_entries" USING btree ("box","created_at");--> statement-breakpoint
CREATE INDEX "expenses_spent_at_index" ON "expenses" USING btree ("spent_at");--> statement-breakpoint
CREATE INDEX "ops_events_created_at_index" ON "ops_events" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "shifts_one_open" ON "shifts" USING btree ("status") WHERE "shifts"."status" = 'open';--> statement-breakpoint
ALTER TABLE "staff" ADD CONSTRAINT "staff_telegramUserId_unique" UNIQUE("telegram_user_id");--> statement-breakpoint
ALTER TABLE "staff" ADD CONSTRAINT "staff_roles_check" CHECK (cardinality("staff"."roles") > 0);