ALTER TYPE "public"."product_kind" ADD VALUE 'drink';--> statement-breakpoint
ALTER TYPE "public"."product_kind" ADD VALUE 'cafe';--> statement-breakpoint
CREATE TABLE "members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_user_id" text NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"referral_code" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "members_clerkUserId_unique" UNIQUE("clerk_user_id"),
	CONSTRAINT "members_referralCode_unique" UNIQUE("referral_code")
);
--> statement-breakpoint
ALTER TABLE "members" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "point_moves" (
	"id" serial PRIMARY KEY NOT NULL,
	"member_id" uuid NOT NULL,
	"delta" integer NOT NULL,
	"reason" text NOT NULL,
	"order_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "point_moves_reason_check" CHECK ("point_moves"."reason" IN ('order', 'redeem'))
);
--> statement-breakpoint
ALTER TABLE "point_moves" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "vouchers" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"kind" text NOT NULL,
	"amount" integer NOT NULL,
	"min_subtotal" integer DEFAULT 0 NOT NULL,
	"member_id" uuid,
	"customer_id" uuid,
	"source_order_id" uuid,
	"used_order_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vouchers_code_unique" UNIQUE("code"),
	CONSTRAINT "vouchers_usedOrderId_unique" UNIQUE("used_order_id"),
	CONSTRAINT "vouchers_kind_check" CHECK ("vouchers"."kind" IN ('welcome', 'review', 'referral', 'points')),
	CONSTRAINT "vouchers_amount_check" CHECK ("vouchers"."amount" > 0 AND "vouchers"."min_subtotal" >= 0),
	CONSTRAINT "vouchers_owner_check" CHECK ("vouchers"."member_id" IS NOT NULL OR "vouchers"."customer_id" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "vouchers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "batches" DROP CONSTRAINT "batches_times_check";--> statement-breakpoint
ALTER TABLE "batches" ADD COLUMN "segment" text DEFAULT 'pizza' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "member_id" uuid;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "referrer_id" uuid;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "list_price" integer;--> statement-breakpoint
ALTER TABLE "slot_templates" ADD COLUMN "segment" text DEFAULT 'pizza' NOT NULL;--> statement-breakpoint
ALTER TABLE "staff" ADD COLUMN "clerk_user_id" text;--> statement-breakpoint
ALTER TABLE "staff" ADD COLUMN "pending" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "point_moves" ADD CONSTRAINT "point_moves_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "point_moves" ADD CONSTRAINT "point_moves_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_source_order_id_orders_id_fk" FOREIGN KEY ("source_order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_used_order_id_orders_id_fk" FOREIGN KEY ("used_order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "point_moves_member_id_index" ON "point_moves" USING btree ("member_id");--> statement-breakpoint
CREATE UNIQUE INDEX "point_moves_order_key" ON "point_moves" USING btree ("order_id") WHERE "point_moves"."reason" = 'order';--> statement-breakpoint
CREATE INDEX "vouchers_member_id_index" ON "vouchers" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "vouchers_customer_id_index" ON "vouchers" USING btree ("customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "vouchers_source_kind_key" ON "vouchers" USING btree ("source_order_id","kind");--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_referrer_id_members_id_fk" FOREIGN KEY ("referrer_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff" ADD CONSTRAINT "staff_clerkUserId_unique" UNIQUE("clerk_user_id");--> statement-breakpoint
ALTER TABLE "batches" ADD CONSTRAINT "batches_segment_check" CHECK ("batches"."segment" IN ('pizza', 'cafe'));--> statement-breakpoint
ALTER TABLE "batches" ADD CONSTRAINT "batches_times_check" CHECK ("batches"."oven_at" <= "batches"."ready_at" AND "batches"."cutoff_at" <= "batches"."ready_at" AND ("batches"."segment" = 'cafe' OR "batches"."cutoff_at" <= "batches"."oven_at"));--> statement-breakpoint
ALTER TABLE "slot_templates" ADD CONSTRAINT "slot_templates_segment_check" CHECK ("slot_templates"."segment" IN ('pizza', 'cafe'));