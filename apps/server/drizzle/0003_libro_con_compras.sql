ALTER TABLE "coin_ledger" DROP CONSTRAINT "coin_ledger_amount_check";--> statement-breakpoint
ALTER TABLE "coin_ledger" ALTER COLUMN "match_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "coin_ledger" ALTER COLUMN "round" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "coin_ledger" ADD COLUMN "purchase_id" uuid;--> statement-breakpoint
ALTER TABLE "coin_ledger" ADD COLUMN "cards" text[];--> statement-breakpoint
ALTER TABLE "coin_ledger" ADD CONSTRAINT "coin_ledger_user_purchase_key" UNIQUE("user_id","purchase_id");--> statement-breakpoint
ALTER TABLE "coin_ledger" ADD CONSTRAINT "coin_ledger_kind_check" CHECK (("coin_ledger"."match_id" is not null and "coin_ledger"."round" is not null and "coin_ledger"."purchase_id" is null and "coin_ledger"."cards" is null and "coin_ledger"."amount" > 0) or ("coin_ledger"."purchase_id" is not null and "coin_ledger"."cards" is not null and "coin_ledger"."match_id" is null and "coin_ledger"."round" is null and "coin_ledger"."amount" < 0));