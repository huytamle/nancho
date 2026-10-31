CREATE TYPE "public"."bill_status" AS ENUM('open', 'paid', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."stock_level" AS ENUM('raw', 'prep', 'goods');--> statement-breakpoint
CREATE TYPE "public"."stock_move_kind" AS ENUM('purchase', 'produce_in', 'produce_out', 'sale', 'waste', 'adjust');--> statement-breakpoint
CREATE TABLE "production_formulas" (
	"id" serial PRIMARY KEY NOT NULL,
	"output_id" text NOT NULL,
	"output_qty" numeric(12, 3) NOT NULL,
	"lines" jsonb NOT NULL,
	CONSTRAINT "production_formulas_outputId_unique" UNIQUE("output_id"),
	CONSTRAINT "production_formulas_qty_check" CHECK ("production_formulas"."output_qty" > 0)
);
--> statement-breakpoint
ALTER TABLE "production_formulas" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "stock_counts" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"lines" jsonb NOT NULL,
	"staff_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "stock_counts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "stock_moves" (
	"id" serial PRIMARY KEY NOT NULL,
	"ingredient_id" text NOT NULL,
	"qty" numeric(12, 3) NOT NULL,
	"kind" "stock_move_kind" NOT NULL,
	"unit_cost" numeric(12, 4) DEFAULT 0 NOT NULL,
	"ref_type" text,
	"ref_id" text,
	"reason" text,
	"note" text,
	"expires_at" timestamp with time zone,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_moves_qty_check" CHECK ("stock_moves"."qty" <> 0),
	CONSTRAINT "stock_moves_sign_check" CHECK (("stock_moves"."kind" IN ('purchase', 'produce_in')) = ("stock_moves"."qty" > 0) OR "stock_moves"."kind" = 'adjust')
);
--> statement-breakpoint
ALTER TABLE "stock_moves" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "supplier_bills" (
	"id" serial PRIMARY KEY NOT NULL,
	"supplier_id" integer NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	"items" jsonb NOT NULL,
	"amount" integer,
	"paid_amount" integer DEFAULT 0 NOT NULL,
	"photo" text,
	"status" "bill_status" DEFAULT 'open' NOT NULL,
	"paid_expense_id" integer,
	"created_by" integer NOT NULL,
	"telegram_chat_id" bigint,
	"telegram_msg_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "supplier_bills_telegram_msg" UNIQUE("telegram_chat_id","telegram_msg_id"),
	CONSTRAINT "supplier_bills_amount_check" CHECK (coalesce("supplier_bills"."amount", 0) >= 0 AND "supplier_bills"."paid_amount" >= 0 AND ("supplier_bills"."amount" IS NULL OR "supplier_bills"."paid_amount" <= "supplier_bills"."amount"))
);
--> statement-breakpoint
ALTER TABLE "supplier_bills" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"aliases" text[] DEFAULT '{}'::text[] NOT NULL,
	"phone" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "suppliers_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "suppliers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "supplier_id" integer;--> statement-breakpoint
ALTER TABLE "ingredients" ADD COLUMN "level" "stock_level" DEFAULT 'prep' NOT NULL;--> statement-breakpoint
ALTER TABLE "ingredients" ADD COLUMN "track_stock" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "ingredients" ADD COLUMN "purchase_unit" text;--> statement-breakpoint
ALTER TABLE "ingredients" ADD COLUMN "purchase_factor" numeric(12, 3);--> statement-breakpoint
ALTER TABLE "ingredients" ADD COLUMN "avg_cost" numeric(12, 4) DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "ingredients" ADD COLUMN "shelf_life_hours" integer;--> statement-breakpoint
ALTER TABLE "ingredients" ADD COLUMN "par_level" numeric(12, 3);--> statement-breakpoint
ALTER TABLE "ingredients" ADD COLUMN "aliases" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "ingredients" ADD COLUMN "count_class" text DEFAULT 'C' NOT NULL;--> statement-breakpoint
ALTER TABLE "ingredients" ADD COLUMN "count_roles" "role"[] DEFAULT '{kitchen}'::role[] NOT NULL;--> statement-breakpoint
ALTER TABLE "ingredients" ADD COLUMN "count_tolerance_pct" smallint DEFAULT 5 NOT NULL;--> statement-breakpoint
ALTER TABLE "production_formulas" ADD CONSTRAINT "production_formulas_output_id_ingredients_id_fk" FOREIGN KEY ("output_id") REFERENCES "public"."ingredients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_counts" ADD CONSTRAINT "stock_counts_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_moves" ADD CONSTRAINT "stock_moves_ingredient_id_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_bills" ADD CONSTRAINT "supplier_bills_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_bills" ADD CONSTRAINT "supplier_bills_paid_expense_id_expenses_id_fk" FOREIGN KEY ("paid_expense_id") REFERENCES "public"."expenses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_bills" ADD CONSTRAINT "supplier_bills_created_by_staff_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "stock_counts_created_at_index" ON "stock_counts" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "stock_moves_ingredient_id_created_at_index" ON "stock_moves" USING btree ("ingredient_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "stock_moves_once" ON "stock_moves" USING btree ("kind","ref_type","ref_id","ingredient_id") WHERE "stock_moves"."kind" IN ('sale', 'purchase');--> statement-breakpoint
CREATE INDEX "supplier_bills_supplier_id_status_index" ON "supplier_bills" USING btree ("supplier_id","status");--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingredients" ADD CONSTRAINT "ingredients_count_class_check" CHECK ("ingredients"."count_class" IN ('A', 'B', 'C'));--> statement-breakpoint
ALTER TABLE "ingredients" ADD CONSTRAINT "ingredients_cost_check" CHECK ("ingredients"."avg_cost" >= 0);--> statement-breakpoint
ALTER TABLE "ingredients" ADD CONSTRAINT "ingredients_purchase_check" CHECK (("ingredients"."purchase_unit" IS NULL) = ("ingredients"."purchase_factor" IS NULL) AND coalesce("ingredients"."purchase_factor", 1) > 0);--> statement-breakpoint
ALTER TABLE "ingredients" ADD CONSTRAINT "ingredients_stock_check" CHECK (coalesce("ingredients"."shelf_life_hours", 1) > 0 AND coalesce("ingredients"."par_level", 0) >= 0 AND "ingredients"."count_tolerance_pct" BETWEEN 0 AND 100);