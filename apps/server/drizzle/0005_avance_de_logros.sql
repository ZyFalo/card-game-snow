-- Reinicio de los logros de la Beta (D-104). Los logros pasan a tener contadores, y lo que cada persona
-- lleva contado no se puede reconstruir con lo guardado hasta hoy: todas las cuentas empiezan de cero.
-- Las monedas ya ganadas no se tocan: el libro de monedas y los saldos quedan como están.
DELETE FROM "achievements";
--> statement-breakpoint
ALTER TABLE "achievements" DROP CONSTRAINT "achievements_match_id_matches_id_fk";
--> statement-breakpoint
ALTER TABLE "achievements" ALTER COLUMN "unlocked_at" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "achievements" ALTER COLUMN "unlocked_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "achievements" ADD COLUMN "progress" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "achievements" DROP COLUMN "match_id";--> statement-breakpoint
ALTER TABLE "achievements" ADD CONSTRAINT "achievements_progress_check" CHECK ("achievements"."progress" >= 0);
