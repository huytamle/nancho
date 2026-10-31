CREATE TYPE "public"."batch_status" AS ENUM('open', 'closed', 'baking', 'done');--> statement-breakpoint
CREATE TYPE "public"."channel" AS ENUM('web', 'phone', 'zalo', 'walkin', 'grab', 'shopee');--> statement-breakpoint
CREATE TYPE "public"."day_status" AS ENUM('open', 'closed', 'paused');--> statement-breakpoint
CREATE TYPE "public"."fulfillment" AS ENUM('delivery', 'pickup');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('placed', 'confirmed', 'baking', 'ready', 'delivering', 'completed', 'cancelled', 'no_show');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('cod', 'transfer');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('unpaid', 'paid', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."product_kind" AS ENUM('pizza', 'bbq', 'combo', 'addon');--> statement-breakpoint
CREATE TYPE "public"."staff_role" AS ENUM('owner', 'kitchen', 'shipper');--> statement-breakpoint
CREATE TABLE "addresses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"zone_id" integer NOT NULL,
	"description" text NOT NULL,
	"lat" double precision,
	"lng" double precision,
	"last_used_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "addresses" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "batches" (
	"id" serial PRIMARY KEY NOT NULL,
	"service_date" date NOT NULL,
	"ready_at" timestamp with time zone NOT NULL,
	"oven_at" timestamp with time zone NOT NULL,
	"cutoff_at" timestamp with time zone NOT NULL,
	"cap_pan" smallint NOT NULL,
	"cap_bbq" smallint NOT NULL,
	"used_pan" smallint DEFAULT 0 NOT NULL,
	"used_bbq" smallint DEFAULT 0 NOT NULL,
	"status" "batch_status" DEFAULT 'open' NOT NULL,
	CONSTRAINT "batches_service_date_ready_at_key" UNIQUE("service_date","ready_at"),
	CONSTRAINT "batches_capacity_check" CHECK ("batches"."used_pan" <= "batches"."cap_pan" AND "batches"."used_bbq" <= "batches"."cap_bbq"),
	CONSTRAINT "batches_used_check" CHECK ("batches"."used_pan" >= 0 AND "batches"."used_bbq" >= 0),
	CONSTRAINT "batches_times_check" CHECK ("batches"."cutoff_at" <= "batches"."oven_at" AND "batches"."oven_at" <= "batches"."ready_at")
);
--> statement-breakpoint
ALTER TABLE "batches" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone" text NOT NULL,
	"name" text NOT NULL,
	"remember" boolean DEFAULT false NOT NULL,
	"order_count" integer DEFAULT 0 NOT NULL,
	"completed_count" integer DEFAULT 0 NOT NULL,
	"no_show_count" integer DEFAULT 0 NOT NULL,
	"last_order_at" timestamp with time zone,
	"is_blocked" boolean DEFAULT false NOT NULL,
	"staff_note" text,
	"marketing_opt_in" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customers_phone_unique" UNIQUE("phone")
);
--> statement-breakpoint
ALTER TABLE "customers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "ingredients" (
	"id" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"unit" text NOT NULL,
	"unit_weight_g" integer,
	"storage" text NOT NULL,
	"sort" smallint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ingredients" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "order_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" uuid NOT NULL,
	"type" text NOT NULL,
	"data" jsonb,
	"actor" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "order_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" uuid NOT NULL,
	"product_id" text NOT NULL,
	"name" text NOT NULL,
	"unit_price" integer NOT NULL,
	"qty" smallint NOT NULL,
	"line_total" integer NOT NULL,
	"parent_item_id" integer,
	"combo_choices" jsonb,
	"is_gift" boolean DEFAULT false NOT NULL,
	CONSTRAINT "order_items_qty_check" CHECK ("order_items"."qty" > 0),
	CONSTRAINT "order_items_line_total_check" CHECK ("order_items"."line_total" = "order_items"."unit_price" * "order_items"."qty" AND "order_items"."unit_price" >= 0)
);
--> statement-breakpoint
ALTER TABLE "order_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"seq" integer NOT NULL,
	"service_date" date NOT NULL,
	"batch_id" integer NOT NULL,
	"channel" "channel" DEFAULT 'web' NOT NULL,
	"customer_id" uuid NOT NULL,
	"customer_name" text NOT NULL,
	"customer_phone" text NOT NULL,
	"fulfillment" "fulfillment" NOT NULL,
	"zone_id" integer,
	"pickup_point_id" integer,
	"address_text" text,
	"lat" double precision,
	"lng" double precision,
	"pan_units" smallint DEFAULT 0 NOT NULL,
	"bbq_units" smallint DEFAULT 0 NOT NULL,
	"subtotal" integer NOT NULL,
	"ship_fee" integer DEFAULT 0 NOT NULL,
	"discount" integer DEFAULT 0 NOT NULL,
	"total" integer NOT NULL,
	"payment_method" "payment_method" NOT NULL,
	"payment_status" "payment_status" DEFAULT 'unpaid' NOT NULL,
	"status" "order_status" DEFAULT 'placed' NOT NULL,
	"note" text,
	"source" text,
	"tracking_token" text NOT NULL,
	"idempotency_key" uuid NOT NULL,
	"cancel_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_code_unique" UNIQUE("code"),
	CONSTRAINT "orders_trackingToken_unique" UNIQUE("tracking_token"),
	CONSTRAINT "orders_idempotencyKey_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "orders_service_date_seq_key" UNIQUE("service_date","seq"),
	CONSTRAINT "orders_fulfillment_check" CHECK (("orders"."fulfillment" = 'delivery' AND "orders"."zone_id" IS NOT NULL AND "orders"."pickup_point_id" IS NULL)
        OR ("orders"."fulfillment" = 'pickup' AND "orders"."pickup_point_id" IS NOT NULL AND "orders"."zone_id" IS NULL)),
	CONSTRAINT "orders_total_check" CHECK ("orders"."subtotal" >= 0 AND "orders"."ship_fee" >= 0 AND "orders"."discount" >= 0
        AND "orders"."total" = "orders"."subtotal" + "orders"."ship_fee" - "orders"."discount" AND "orders"."total" >= 0),
	CONSTRAINT "orders_units_check" CHECK ("orders"."pan_units" >= 0 AND "orders"."bbq_units" >= 0),
	CONSTRAINT "orders_note_check" CHECK (char_length("orders"."note") <= 300)
);
--> statement-breakpoint
ALTER TABLE "orders" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" uuid,
	"provider" text NOT NULL,
	"provider_txn_id" text NOT NULL,
	"amount" integer NOT NULL,
	"memo" text,
	"raw" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_providerTxnId_unique" UNIQUE("provider_txn_id")
);
--> statement-breakpoint
ALTER TABLE "payments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "pickup_points" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"address" text NOT NULL,
	"maps_url" text,
	"gift_product_id" text,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pickup_points" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "products" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" "product_kind" NOT NULL,
	"name" text NOT NULL,
	"short" text NOT NULL,
	"description" text,
	"price" integer NOT NULL,
	"image" text NOT NULL,
	"badge" text,
	"uses_pan" smallint DEFAULT 0 NOT NULL,
	"uses_bbq" smallint DEFAULT 0 NOT NULL,
	"combo_config" jsonb,
	"upsell_ids" text[] DEFAULT '{}'::text[] NOT NULL,
	"supplier" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_available" boolean DEFAULT true NOT NULL,
	"sort" smallint DEFAULT 0 NOT NULL,
	CONSTRAINT "products_price_check" CHECK ("products"."price" >= 0),
	CONSTRAINT "products_short_check" CHECK (char_length("products"."short") <= 40),
	CONSTRAINT "products_units_check" CHECK ("products"."uses_pan" >= 0 AND "products"."uses_bbq" >= 0)
);
--> statement-breakpoint
ALTER TABLE "products" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"key" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "rate_limits_key_window_start_pk" PRIMARY KEY("key","window_start")
);
--> statement-breakpoint
ALTER TABLE "rate_limits" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "recipe_lines" (
	"product_id" text NOT NULL,
	"ingredient_id" text NOT NULL,
	"qty" numeric(10, 2) NOT NULL,
	CONSTRAINT "recipe_lines_product_id_ingredient_id_pk" PRIMARY KEY("product_id","ingredient_id"),
	CONSTRAINT "recipe_lines_qty_check" CHECK ("recipe_lines"."qty" > 0)
);
--> statement-breakpoint
ALTER TABLE "recipe_lines" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "routes" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"sort" smallint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "routes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "service_days" (
	"date" date PRIMARY KEY NOT NULL,
	"status" "day_status" DEFAULT 'open' NOT NULL,
	"pause_message" text,
	"order_seq" integer DEFAULT 0 NOT NULL,
	"summary_sent_at" timestamp with time zone,
	"note" text
);
--> statement-breakpoint
ALTER TABLE "service_days" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "slot_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"weekday" smallint NOT NULL,
	"ready_time" time NOT NULL,
	"oven_lead_min" smallint NOT NULL,
	"cutoff_time" time NOT NULL,
	"cap_pan" smallint NOT NULL,
	"cap_bbq" smallint NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "slot_templates_weekday_ready_time_key" UNIQUE("weekday","ready_time"),
	CONSTRAINT "slot_templates_weekday_check" CHECK ("slot_templates"."weekday" BETWEEN 0 AND 6),
	CONSTRAINT "slot_templates_cutoff_check" CHECK ("slot_templates"."cutoff_time" < "slot_templates"."ready_time"),
	CONSTRAINT "slot_templates_cap_check" CHECK ("slot_templates"."cap_pan" >= 0 AND "slot_templates"."cap_bbq" >= 0 AND "slot_templates"."oven_lead_min" >= 0)
);
--> statement-breakpoint
ALTER TABLE "slot_templates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "staff" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"role" "staff_role" NOT NULL,
	"pin_hash" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "staff_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "staff" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "zones" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"route_id" integer NOT NULL,
	"ship_fee" integer NOT NULL,
	"sort" smallint DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "zones_ship_fee_check" CHECK ("zones"."ship_fee" >= 0)
);
--> statement-breakpoint
ALTER TABLE "zones" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "addresses" ADD CONSTRAINT "addresses_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "addresses" ADD CONSTRAINT "addresses_zone_id_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."zones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batches" ADD CONSTRAINT "batches_service_date_service_days_date_fk" FOREIGN KEY ("service_date") REFERENCES "public"."service_days"("date") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_parent_item_id_order_items_id_fk" FOREIGN KEY ("parent_item_id") REFERENCES "public"."order_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_service_date_service_days_date_fk" FOREIGN KEY ("service_date") REFERENCES "public"."service_days"("date") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_zone_id_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."zones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_pickup_point_id_pickup_points_id_fk" FOREIGN KEY ("pickup_point_id") REFERENCES "public"."pickup_points"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pickup_points" ADD CONSTRAINT "pickup_points_gift_product_id_products_id_fk" FOREIGN KEY ("gift_product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_lines" ADD CONSTRAINT "recipe_lines_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_lines" ADD CONSTRAINT "recipe_lines_ingredient_id_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zones" ADD CONSTRAINT "zones_route_id_routes_id_fk" FOREIGN KEY ("route_id") REFERENCES "public"."routes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "addresses_customer_id_idx" ON "addresses" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "order_events_order_id_idx" ON "order_events" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_items_order_id_idx" ON "order_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "orders_service_date_batch_id_idx" ON "orders" USING btree ("service_date","batch_id");--> statement-breakpoint
CREATE INDEX "orders_customer_phone_idx" ON "orders" USING btree ("customer_phone");--> statement-breakpoint
CREATE INDEX "orders_status_idx" ON "orders" USING btree ("status");