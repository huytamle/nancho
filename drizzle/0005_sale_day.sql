CREATE TABLE "cash_handovers" (
	"id" serial PRIMARY KEY NOT NULL,
	"service_date" date NOT NULL,
	"shipper_id" integer NOT NULL,
	"order_ids" uuid[] NOT NULL,
	"expected" integer NOT NULL,
	"received" integer NOT NULL,
	"received_by" integer NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cash_handovers_amount_check" CHECK ("cash_handovers"."expected" >= 0 AND "cash_handovers"."received" >= 0),
	CONSTRAINT "cash_handovers_orders_check" CHECK (cardinality("cash_handovers"."order_ids") > 0),
	CONSTRAINT "cash_handovers_people_check" CHECK ("cash_handovers"."shipper_id" <> "cash_handovers"."received_by")
);
--> statement-breakpoint
ALTER TABLE "cash_handovers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "feedback" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" uuid NOT NULL,
	"ratings" jsonb NOT NULL,
	"tags" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feedback_orderId_unique" UNIQUE("order_id"),
	CONSTRAINT "feedback_comment_check" CHECK (char_length("feedback"."comment") <= 300)
);
--> statement-breakpoint
ALTER TABLE "feedback" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "hold_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "cash_handovers" ADD CONSTRAINT "cash_handovers_shipper_id_staff_id_fk" FOREIGN KEY ("shipper_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_handovers" ADD CONSTRAINT "cash_handovers_received_by_staff_id_fk" FOREIGN KEY ("received_by") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cash_handovers_service_date_index" ON "cash_handovers" USING btree ("service_date");--> statement-breakpoint
CREATE INDEX "feedback_created_at_index" ON "feedback" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "orders_hold_until_idx" ON "orders" USING btree ("hold_until") WHERE "orders"."status" = 'placed' AND "orders"."payment_status" = 'unpaid' AND "orders"."hold_until" IS NOT NULL;