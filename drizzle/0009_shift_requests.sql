CREATE TABLE "shift_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"staff_id" integer NOT NULL,
	"date" date NOT NULL,
	"start" time,
	"end" time,
	"target_id" integer,
	"status" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"decided_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shift_requests_note_check" CHECK (char_length("shift_requests"."note") <= 200)
);
--> statement-breakpoint
ALTER TABLE "shift_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "shift_requests" ADD CONSTRAINT "shift_requests_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_requests" ADD CONSTRAINT "shift_requests_target_id_staff_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_requests" ADD CONSTRAINT "shift_requests_decided_by_staff_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "shift_requests_date_index" ON "shift_requests" USING btree ("date");