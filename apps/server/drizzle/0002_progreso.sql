CREATE TABLE "coin_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"match_id" uuid NOT NULL,
	"round" text NOT NULL,
	"amount" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "coin_ledger_user_match_round_key" UNIQUE("user_id","match_id","round"),
	CONSTRAINT "coin_ledger_round_check" CHECK ("coin_ledger"."round" in ('1', '2', '3', 'bonus')),
	CONSTRAINT "coin_ledger_amount_check" CHECK ("coin_ledger"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "collection" (
	"user_id" uuid NOT NULL,
	"card_id" text NOT NULL,
	"count" integer NOT NULL,
	CONSTRAINT "collection_user_id_card_id_pk" PRIMARY KEY("user_id","card_id"),
	CONSTRAINT "collection_count_check" CHECK ("collection"."count" > 0)
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"camino_element" text NOT NULL,
	"coins" integer DEFAULT 0 NOT NULL,
	"boxes_opened" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profiles_camino_element_check" CHECK ("profiles"."camino_element" in ('fire', 'water', 'snow')),
	CONSTRAINT "profiles_coins_check" CHECK ("profiles"."coins" >= 0),
	CONSTRAINT "profiles_boxes_opened_check" CHECK ("profiles"."boxes_opened" >= 0)
);
--> statement-breakpoint
ALTER TABLE "coin_ledger" ADD CONSTRAINT "coin_ledger_user_id_profiles_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection" ADD CONSTRAINT "collection_user_id_profiles_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;