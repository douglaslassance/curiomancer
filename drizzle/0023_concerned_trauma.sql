CREATE INDEX "conversation_user_b_idx" ON "conversation" USING btree ("user_b_id");--> statement-breakpoint
CREATE INDEX "place_relation_place_idx" ON "place_relation" USING btree ("place_id");