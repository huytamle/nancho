CREATE TABLE "cafe_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"aliases" text[] DEFAULT '{}'::text[] NOT NULL,
	"price" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort" smallint DEFAULT 0 NOT NULL,
	CONSTRAINT "cafe_items_name_unique" UNIQUE("name"),
	CONSTRAINT "cafe_items_price_check" CHECK ("cafe_items"."price" >= 0),
	CONSTRAINT "cafe_items_name_check" CHECK (char_length("cafe_items"."name") BETWEEN 1 AND 80)
);
--> statement-breakpoint
ALTER TABLE "cafe_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "cafe_recipe_lines" (
	"item_id" integer NOT NULL,
	"ingredient_id" text NOT NULL,
	"qty" numeric(10, 2) NOT NULL,
	CONSTRAINT "cafe_recipe_lines_item_id_ingredient_id_pk" PRIMARY KEY("item_id","ingredient_id"),
	CONSTRAINT "cafe_recipe_lines_qty_check" CHECK ("cafe_recipe_lines"."qty" > 0)
);
--> statement-breakpoint
ALTER TABLE "cafe_recipe_lines" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "cafe_sales" (
	"id" serial PRIMARY KEY NOT NULL,
	"service_date" date NOT NULL,
	"lines" jsonb NOT NULL,
	"created_by" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cafe_sales_serviceDate_unique" UNIQUE("service_date")
);
--> statement-breakpoint
ALTER TABLE "cafe_sales" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ingredients" ADD COLUMN "segment" text DEFAULT 'pizza' NOT NULL;--> statement-breakpoint
ALTER TABLE "cafe_recipe_lines" ADD CONSTRAINT "cafe_recipe_lines_item_id_cafe_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."cafe_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cafe_recipe_lines" ADD CONSTRAINT "cafe_recipe_lines_ingredient_id_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cafe_sales" ADD CONSTRAINT "cafe_sales_created_by_staff_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingredients" ADD CONSTRAINT "ingredients_segment_check" CHECK ("ingredients"."segment" IN ('pizza', 'cafe'));--> statement-breakpoint
-- Nguyên liệu chỉ quầy café đếm (Pepsi, Sting…) → mảng café.
UPDATE "ingredients" SET "segment" = 'cafe' WHERE 'barista' = ANY("count_roles") AND NOT 'kitchen' = ANY("count_roles");
