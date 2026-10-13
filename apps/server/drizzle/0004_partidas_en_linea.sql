CREATE TABLE "achievements" (
	"user_id" uuid NOT NULL,
	"achievement_id" text NOT NULL,
	"match_id" uuid,
	"unlocked_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "achievements_user_id_achievement_id_pk" PRIMARY KEY("user_id","achievement_id")
);
--> statement-breakpoint
CREATE TABLE "match_players" (
	"match_id" uuid NOT NULL,
	"seat" text NOT NULL,
	"user_id" uuid,
	"rounds" text[] DEFAULT '{}'::text[] NOT NULL,
	"exit" text,
	"notice" text,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"left_at" timestamp with time zone,
	CONSTRAINT "match_players_match_id_seat_pk" PRIMARY KEY("match_id","seat"),
	CONSTRAINT "match_players_seat_check" CHECK ("match_players"."seat" in ('fire', 'water', 'snow')),
	CONSTRAINT "match_players_exit_check" CHECK ("match_players"."exit" in ('finished', 'abandoned', 'interrupted')),
	CONSTRAINT "match_players_notice_check" CHECK ("match_players"."notice" in ('left_behind', 'restart'))
);
--> statement-breakpoint
CREATE TABLE "matches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_code" text,
	"difficulty" text NOT NULL,
	"seed" bigint NOT NULL,
	"status" text DEFAULT 'playing' NOT NULL,
	"outcome" text,
	"bonus_outcome" text,
	"turns" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	CONSTRAINT "matches_status_check" CHECK ("matches"."status" in ('playing', 'finished', 'abandoned', 'interrupted')),
	CONSTRAINT "matches_difficulty_check" CHECK ("matches"."difficulty" in ('classic', 'storm'))
);
--> statement-breakpoint
CREATE TABLE "player_stats" (
	"user_id" uuid NOT NULL,
	"difficulty" text NOT NULL,
	"matches" integer DEFAULT 0 NOT NULL,
	"rounds" integer DEFAULT 0 NOT NULL,
	"wins" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "player_stats_user_id_difficulty_pk" PRIMARY KEY("user_id","difficulty"),
	CONSTRAINT "player_stats_difficulty_check" CHECK ("player_stats"."difficulty" in ('classic', 'storm')),
	CONSTRAINT "player_stats_counts_check" CHECK ("player_stats"."matches" >= 0 and "player_stats"."rounds" >= 0 and "player_stats"."wins" >= 0)
);
--> statement-breakpoint
ALTER TABLE "achievements" ADD CONSTRAINT "achievements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "achievements" ADD CONSTRAINT "achievements_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_players" ADD CONSTRAINT "match_players_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_players" ADD CONSTRAINT "match_players_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_stats" ADD CONSTRAINT "player_stats_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "match_players_user_id_idx" ON "match_players" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "matches_status_idx" ON "matches" USING btree ("status");--> statement-breakpoint
-- Los cobros de antes de las partidas en línea llevaban el id de una partida que no existía como fila:
-- cada uno recibe la suya, ya terminada, para que el libro pueda apuntar a "matches".
INSERT INTO "matches" ("id", "difficulty", "seed", "status", "ended_at")
SELECT DISTINCT "match_id", 'classic', 0, 'finished', now() FROM "coin_ledger" WHERE "match_id" IS NOT NULL
ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint
ALTER TABLE "coin_ledger" ADD CONSTRAINT "coin_ledger_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE no action ON UPDATE no action;