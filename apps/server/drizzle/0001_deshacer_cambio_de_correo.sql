ALTER TABLE "email_codes" DROP CONSTRAINT "email_codes_purpose_check";--> statement-breakpoint
CREATE INDEX "email_codes_purpose_new_email_idx" ON "email_codes" USING btree ("purpose","new_email");--> statement-breakpoint
ALTER TABLE "email_codes" ADD CONSTRAINT "email_codes_purpose_check" CHECK ("email_codes"."purpose" in ('verify', 'recover', 'change_email', 'revert_email'));