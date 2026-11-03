


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "pg_catalog";






CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "extensions";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."accept_friend_request"("request_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
    UPDATE public.friend_requests
    SET status = 'accepted',
        responded_at = NOW()
    WHERE id = request_id
      AND addressee_id = auth.uid()
      AND status = 'pending';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Request not found or cannot be accepted.';
    END IF;

    RETURN TRUE;
END;
$$;


ALTER FUNCTION "public"."accept_friend_request"("request_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."acknowledge_knock"("recipient_row_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  updated_count integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  update public.knock_recipients
  set
    status = 'acknowledged',
    acknowledged_at = coalesce(acknowledged_at, now())
  where id = recipient_row_id
    and recipient_id = auth.uid()
    and status in ('sent', 'delivered');

  get diagnostics updated_count = row_count;

  return updated_count = 1;
end;
$$;


ALTER FUNCTION "public"."acknowledge_knock"("recipient_row_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_access_knock_reply"("p_knock_id" "uuid", "p_user_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.knocks k
        WHERE k.id = p_knock_id
        AND k.sender_id = p_user_id
    )
    OR EXISTS (
        SELECT 1
        FROM public.knock_recipients kr
        WHERE kr.knock_id = p_knock_id
        AND kr.recipient_id = p_user_id
    );
$$;


ALTER FUNCTION "public"."can_access_knock_reply"("p_knock_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_access_knock_reply_storage"("p_knock_id" "text", "p_user_id" "uuid", "p_upload" boolean DEFAULT false) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.knocks k
        WHERE k.id::TEXT = p_knock_id
        AND (
            k.sender_id = p_user_id
            OR (
                NOT p_upload
                AND EXISTS (
                    SELECT 1
                    FROM public.knock_recipients kr
                    WHERE kr.knock_id = k.id
                    AND kr.recipient_id = p_user_id
                )
            )
            OR (
                p_upload
                AND EXISTS (
                    SELECT 1
                    FROM public.knock_recipients kr
                    WHERE kr.knock_id = k.id
                    AND kr.recipient_id = p_user_id
                )
            )
        )
    );
$$;


ALTER FUNCTION "public"."can_access_knock_reply_storage"("p_knock_id" "text", "p_user_id" "uuid", "p_upload" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_send_knock_reply"("p_knock_id" "uuid", "p_recipient_row_id" "uuid", "p_user_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.knocks k
        JOIN public.knock_recipients kr
            ON kr.knock_id = k.id
        WHERE k.id = p_knock_id
          AND kr.id = p_recipient_row_id
          AND (
              k.sender_id = p_user_id
              OR kr.recipient_id = p_user_id
          )
    );
$$;


ALTER FUNCTION "public"."can_send_knock_reply"("p_knock_id" "uuid", "p_recipient_row_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_view_knock"("target_knock_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    SET "row_security" TO 'off'
    AS $$
  select exists (
    select 1
    from public.knocks k
    where k.id = target_knock_id
      and (
        k.sender_id = (select auth.uid())
        or exists (
          select 1
          from public.knock_recipients kr
          where kr.knock_id = k.id
            and kr.recipient_id = (select auth.uid())
        )
      )
  );
$$;


ALTER FUNCTION "public"."can_view_knock"("target_knock_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_view_knock_recipient"("target_knock_id" "uuid", "target_recipient_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    SET "row_security" TO 'off'
    AS $$
  select
    target_recipient_id = (select auth.uid())
    or exists (
      select 1
      from public.knocks k
      where k.id = target_knock_id
        and k.sender_id = (select auth.uid())
    );
$$;


ALTER FUNCTION "public"."can_view_knock_recipient"("target_knock_id" "uuid", "target_recipient_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cancel_friend_request"("request_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
    UPDATE public.friend_requests
    SET status = 'cancelled',
        responded_at = NOW()
    WHERE id = request_id
      AND requester_id = auth.uid()
      AND status = 'pending';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Request not found or cannot be cancelled.';
    END IF;

    RETURN TRUE;
END;
$$;


ALTER FUNCTION "public"."cancel_friend_request"("request_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
    INSERT INTO public.profiles (id, username, full_name)
    VALUES (
        NEW.id,
        LOWER(NEW.raw_user_meta_data ->> 'username'),
        COALESCE(NEW.raw_user_meta_data ->> 'full_name', '')
    );

    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_username_available"("candidate_username" "text") RETURNS boolean
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
    SELECT NOT EXISTS (
        SELECT 1
        FROM public.profiles
        WHERE LOWER(username) = LOWER(candidate_username)
    );
$$;


ALTER FUNCTION "public"."is_username_available"("candidate_username" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_on_knock_created"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
    v_secret TEXT;
BEGIN
    -- Retrieve webhook secret from Supabase Vault
    SELECT decrypted_secret
    INTO v_secret
    FROM vault.decrypted_secrets
    WHERE name = 'knock_webhook_secret';

    IF v_secret IS NULL THEN
        RAISE WARNING 'Knock webhook secret not configured.';
        RETURN NEW;
    END IF;

    -- Call Edge Function asynchronously
    PERFORM net.http_post(
        url := 'https://zxsaangbzropyxtyjdzu.supabase.co/functions/v1/send-knock-notification',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-knock-webhook-secret', v_secret
        ),
        body := jsonb_build_object(
            'type', 'INSERT',
            'table', 'knocks',
            'schema', 'public',
            'record', to_jsonb(NEW),
            'old_record', NULL
        )
    );

    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."notify_on_knock_created"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reject_friend_request"("request_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
    UPDATE public.friend_requests
    SET status = 'rejected',
        responded_at = NOW()
    WHERE id = request_id
      AND addressee_id = auth.uid()
      AND status = 'pending';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Request not found or cannot be rejected.';
    END IF;

    RETURN TRUE;
END;
$$;


ALTER FUNCTION "public"."reject_friend_request"("request_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."send_friend_request"("target_user_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
    current_user_id UUID;
    existing_request public.friend_requests%ROWTYPE;
    new_request_id UUID;
BEGIN
    current_user_id := auth.uid();

    IF current_user_id IS NULL THEN
        RAISE EXCEPTION 'You must be logged in.';
    END IF;

    IF target_user_id IS NULL OR target_user_id = current_user_id THEN
        RAISE EXCEPTION 'Invalid connection request.';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM auth.users WHERE id = target_user_id
    ) THEN
        RAISE EXCEPTION 'User not found.';
    END IF;

    SELECT *
    INTO existing_request
    FROM public.friend_requests
    WHERE user_low = LEAST(current_user_id, target_user_id)
      AND user_high = GREATEST(current_user_id, target_user_id);

    IF FOUND THEN
        IF existing_request.status IN ('pending', 'accepted') THEN
            RAISE EXCEPTION 'A pending request or connection already exists.';
        END IF;

        UPDATE public.friend_requests
        SET requester_id = current_user_id,
            addressee_id = target_user_id,
            status = 'pending',
            created_at = NOW(),
            responded_at = NULL
        WHERE id = existing_request.id
        RETURNING id INTO new_request_id;

        RETURN new_request_id;
    END IF;

    INSERT INTO public.friend_requests (
        requester_id,
        addressee_id
    )
    VALUES (
        current_user_id,
        target_user_id
    )
    RETURNING id INTO new_request_id;

    RETURN new_request_id;
END;
$$;


ALTER FUNCTION "public"."send_friend_request"("target_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."send_knock"("target_user_ids" "uuid"[], "alert_text" "text" DEFAULT NULL::"text", "custom_message" "text" DEFAULT NULL::"text", "knock_priority" "text" DEFAULT 'normal'::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_sender UUID := auth.uid();
    v_knock_id UUID;
    v_requested_count INTEGER;
    v_valid_count INTEGER;
    v_alert TEXT := NULLIF(TRIM(alert_text), '');
    v_message TEXT := NULLIF(TRIM(custom_message), '');
    v_priority TEXT := LOWER(TRIM(knock_priority));
BEGIN
    IF v_sender IS NULL THEN
        RAISE EXCEPTION 'You must be logged in to send a Knock.';
    END IF;

    IF target_user_ids IS NULL OR cardinality(target_user_ids) = 0 THEN
        RAISE EXCEPTION 'Select at least one recipient.';
    END IF;

    IF cardinality(target_user_ids) > 100 THEN
        RAISE EXCEPTION 'You can send a Knock to a maximum of 100 recipients.';
    END IF;

    IF v_alert IS NULL AND v_message IS NULL THEN
        RAISE EXCEPTION 'Choose an alert or enter a message.';
    END IF;

    IF LENGTH(v_message) > 160 THEN
        RAISE EXCEPTION 'Message cannot exceed 160 characters.';
    END IF;

    IF v_priority NOT IN ('normal', 'urgent') THEN
        RAISE EXCEPTION 'Invalid Knock priority.';
    END IF;

    SELECT COUNT(DISTINCT user_id)
    INTO v_requested_count
    FROM UNNEST(target_user_ids) AS t(user_id);

    IF EXISTS (
        SELECT 1
        FROM UNNEST(target_user_ids) AS t(user_id)
        WHERE user_id IS NULL OR user_id = v_sender
    ) THEN
        RAISE EXCEPTION 'Invalid recipient selection.';
    END IF;

    -- Every recipient must be an accepted contact.
    SELECT COUNT(DISTINCT t.user_id)
    INTO v_valid_count
    FROM UNNEST(target_user_ids) AS t(user_id)
    INNER JOIN public.friend_requests fr
        ON fr.user_low = LEAST(v_sender, t.user_id)
       AND fr.user_high = GREATEST(v_sender, t.user_id)
       AND fr.status = 'accepted';

    IF v_valid_count <> v_requested_count THEN
        RAISE EXCEPTION 'One or more recipients are not accepted contacts.';
    END IF;

    -- Create Knock.
    INSERT INTO public.knocks (
        sender_id,
        alert,
        message,
        priority
    )
    VALUES (
        v_sender,
        v_alert,
        v_message,
        v_priority
    )
    RETURNING id INTO v_knock_id;

    -- Create recipient records.
    INSERT INTO public.knock_recipients (
        knock_id,
        recipient_id
    )
    SELECT
        v_knock_id,
        user_id
    FROM (
        SELECT DISTINCT user_id
        FROM UNNEST(target_user_ids) AS t(user_id)
    ) recipients;

    RETURN v_knock_id;
END;
$$;


ALTER FUNCTION "public"."send_knock"("target_user_ids" "uuid"[], "alert_text" "text", "custom_message" "text", "knock_priority" "text") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."friend_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "requester_id" "uuid" NOT NULL,
    "addressee_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "responded_at" timestamp with time zone,
    "user_low" "uuid" GENERATED ALWAYS AS (LEAST("requester_id", "addressee_id")) STORED,
    "user_high" "uuid" GENERATED ALWAYS AS (GREATEST("requester_id", "addressee_id")) STORED,
    CONSTRAINT "friend_requests_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'accepted'::"text", 'rejected'::"text", 'cancelled'::"text"]))),
    CONSTRAINT "no_self_request" CHECK (("requester_id" <> "addressee_id"))
);


ALTER TABLE "public"."friend_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."hidden_knock_activities" (
    "user_id" "uuid" NOT NULL,
    "recipient_row_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."hidden_knock_activities" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."knock_recipients" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "knock_id" "uuid" NOT NULL,
    "recipient_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'sent'::"text" NOT NULL,
    "delivered_at" timestamp with time zone,
    "acknowledged_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "knock_recipients_status_check" CHECK (("status" = ANY (ARRAY['sent'::"text", 'delivered'::"text", 'acknowledged'::"text"])))
);


ALTER TABLE "public"."knock_recipients" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."knock_replies" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "knock_id" "uuid" NOT NULL,
    "recipient_row_id" "uuid" NOT NULL,
    "sender_id" "uuid" NOT NULL,
    "reply_type" "text" NOT NULL,
    "message" "text",
    "media_path" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "knock_replies_reply_type_check" CHECK (("reply_type" = ANY (ARRAY['text'::"text", 'image'::"text", 'audio'::"text"]))),
    CONSTRAINT "valid_knock_reply_content" CHECK (((("reply_type" = 'text'::"text") AND ("message" IS NOT NULL) AND ("length"(TRIM(BOTH FROM "message")) > 0) AND ("length"("message") <= 2000) AND ("media_path" IS NULL)) OR (("reply_type" = ANY (ARRAY['image'::"text", 'audio'::"text"])) AND ("media_path" IS NOT NULL) AND ("length"("media_path") > 0) AND (("message" IS NULL) OR ("length"("message") <= 2000)))))
);


ALTER TABLE "public"."knock_replies" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."knock_reply_reads" (
    "user_id" "uuid" NOT NULL,
    "recipient_row_id" "uuid" NOT NULL,
    "last_read_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."knock_reply_reads" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."knocks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "sender_id" "uuid" NOT NULL,
    "alert" "text",
    "message" character varying(160),
    "priority" "text" DEFAULT 'normal'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "knock_content_required" CHECK (((NULLIF(TRIM(BOTH FROM COALESCE("alert", ''::"text")), ''::"text") IS NOT NULL) OR (NULLIF(TRIM(BOTH FROM COALESCE("message", ''::character varying)), ''::"text") IS NOT NULL))),
    CONSTRAINT "knocks_priority_check" CHECK (("priority" = ANY (ARRAY['normal'::"text", 'urgent'::"text"])))
);


ALTER TABLE "public"."knocks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "username" "text" NOT NULL,
    "full_name" "text" DEFAULT ''::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "notification_preferences" "jsonb" DEFAULT '{"normal": true, "urgent": true}'::"jsonb" NOT NULL
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."push_receipts" (
    "ticket_id" "text" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "expo_push_token" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "error" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "checked_at" timestamp with time zone
);


ALTER TABLE "public"."push_receipts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_push_tokens" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "expo_push_token" "text" NOT NULL,
    "platform" "text" NOT NULL,
    "device_name" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "user_push_tokens_platform_check" CHECK (("platform" = ANY (ARRAY['android'::"text", 'ios'::"text"])))
);


ALTER TABLE "public"."user_push_tokens" OWNER TO "postgres";


ALTER TABLE ONLY "public"."friend_requests"
    ADD CONSTRAINT "friend_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."hidden_knock_activities"
    ADD CONSTRAINT "hidden_knock_activities_pkey" PRIMARY KEY ("user_id", "recipient_row_id");



ALTER TABLE ONLY "public"."knock_recipients"
    ADD CONSTRAINT "knock_recipients_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."knock_replies"
    ADD CONSTRAINT "knock_replies_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."knock_reply_reads"
    ADD CONSTRAINT "knock_reply_reads_pkey" PRIMARY KEY ("user_id", "recipient_row_id");



ALTER TABLE ONLY "public"."knocks"
    ADD CONSTRAINT "knocks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."push_receipts"
    ADD CONSTRAINT "push_receipts_pkey" PRIMARY KEY ("ticket_id");



ALTER TABLE ONLY "public"."friend_requests"
    ADD CONSTRAINT "unique_connection_pair" UNIQUE ("user_low", "user_high");



ALTER TABLE ONLY "public"."knock_recipients"
    ADD CONSTRAINT "unique_knock_recipient" UNIQUE ("knock_id", "recipient_id");



ALTER TABLE ONLY "public"."user_push_tokens"
    ADD CONSTRAINT "user_push_tokens_expo_push_token_key" UNIQUE ("expo_push_token");



ALTER TABLE ONLY "public"."user_push_tokens"
    ADD CONSTRAINT "user_push_tokens_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_friend_requests_addressee" ON "public"."friend_requests" USING "btree" ("addressee_id", "status");



CREATE INDEX "idx_friend_requests_requester" ON "public"."friend_requests" USING "btree" ("requester_id", "status");



CREATE INDEX "idx_knock_recipients_knock" ON "public"."knock_recipients" USING "btree" ("knock_id");



CREATE INDEX "idx_knock_recipients_user_created" ON "public"."knock_recipients" USING "btree" ("recipient_id", "created_at" DESC);



CREATE INDEX "idx_knock_replies_knock_id" ON "public"."knock_replies" USING "btree" ("knock_id", "created_at");



CREATE INDEX "idx_knock_replies_sender_id" ON "public"."knock_replies" USING "btree" ("sender_id");



CREATE INDEX "idx_knocks_sender_created" ON "public"."knocks" USING "btree" ("sender_id", "created_at" DESC);



CREATE INDEX "idx_push_receipts_pending" ON "public"."push_receipts" USING "btree" ("created_at") WHERE ("status" = 'pending'::"text");



CREATE INDEX "idx_user_push_tokens_user_id" ON "public"."user_push_tokens" USING "btree" ("user_id");



CREATE UNIQUE INDEX "profiles_username_unique" ON "public"."profiles" USING "btree" ("lower"("username"));



CREATE UNIQUE INDEX "user_push_tokens_user_id_expo_push_token_uidx" ON "public"."user_push_tokens" USING "btree" ("user_id", "expo_push_token");



CREATE OR REPLACE TRIGGER "trigger_knock_notification" AFTER INSERT ON "public"."knocks" FOR EACH ROW EXECUTE FUNCTION "public"."notify_on_knock_created"();



ALTER TABLE ONLY "public"."friend_requests"
    ADD CONSTRAINT "friend_requests_addressee_id_fkey" FOREIGN KEY ("addressee_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."friend_requests"
    ADD CONSTRAINT "friend_requests_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."hidden_knock_activities"
    ADD CONSTRAINT "hidden_knock_activities_recipient_row_id_fkey" FOREIGN KEY ("recipient_row_id") REFERENCES "public"."knock_recipients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."hidden_knock_activities"
    ADD CONSTRAINT "hidden_knock_activities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."knock_recipients"
    ADD CONSTRAINT "knock_recipients_knock_id_fkey" FOREIGN KEY ("knock_id") REFERENCES "public"."knocks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."knock_recipients"
    ADD CONSTRAINT "knock_recipients_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."knock_replies"
    ADD CONSTRAINT "knock_replies_knock_id_fkey" FOREIGN KEY ("knock_id") REFERENCES "public"."knocks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."knock_replies"
    ADD CONSTRAINT "knock_replies_recipient_row_id_fkey" FOREIGN KEY ("recipient_row_id") REFERENCES "public"."knock_recipients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."knock_replies"
    ADD CONSTRAINT "knock_replies_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."knock_reply_reads"
    ADD CONSTRAINT "knock_reply_reads_recipient_row_id_fkey" FOREIGN KEY ("recipient_row_id") REFERENCES "public"."knock_recipients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."knock_reply_reads"
    ADD CONSTRAINT "knock_reply_reads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."knocks"
    ADD CONSTRAINT "knocks_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."push_receipts"
    ADD CONSTRAINT "push_receipts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_push_tokens"
    ADD CONSTRAINT "user_push_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "Authenticated users can view profiles" ON "public"."profiles" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Users can delete own push tokens" ON "public"."user_push_tokens" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete their own push tokens" ON "public"."user_push_tokens" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can hide their own activities" ON "public"."hidden_knock_activities" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Users can mark their replies as read" ON "public"."knock_reply_reads" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Users can register own push tokens" ON "public"."user_push_tokens" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can register their own push tokens" ON "public"."user_push_tokens" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can send knock replies" ON "public"."knock_replies" FOR INSERT TO "authenticated" WITH CHECK ((("sender_id" = ( SELECT "auth"."uid"() AS "uid")) AND "public"."can_send_knock_reply"("knock_id", "recipient_row_id", ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "Users can unhide their own activities" ON "public"."hidden_knock_activities" FOR DELETE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Users can update own profile" ON "public"."profiles" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "id")) WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Users can update own push tokens" ON "public"."user_push_tokens" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own push tokens" ON "public"."user_push_tokens" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their reply read status" ON "public"."knock_reply_reads" FOR UPDATE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Users can view knock replies" ON "public"."knock_replies" FOR SELECT TO "authenticated" USING ("public"."can_access_knock_reply"("knock_id", ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Users can view own push tokens" ON "public"."user_push_tokens" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their hidden activities" ON "public"."hidden_knock_activities" FOR SELECT TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Users can view their knock recipient records" ON "public"."knock_recipients" FOR SELECT TO "authenticated" USING ("public"."can_view_knock_recipient"("knock_id", "recipient_id"));



CREATE POLICY "Users can view their own knocks" ON "public"."knocks" FOR SELECT TO "authenticated" USING ("public"."can_view_knock"("id"));



CREATE POLICY "Users can view their own push tokens" ON "public"."user_push_tokens" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own requests" ON "public"."friend_requests" FOR SELECT TO "authenticated" USING ((("auth"."uid"() = "requester_id") OR ("auth"."uid"() = "addressee_id")));



CREATE POLICY "Users can view their reply read status" ON "public"."knock_reply_reads" FOR SELECT TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."friend_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."hidden_knock_activities" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."knock_recipients" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."knock_replies" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."knock_reply_reads" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."knocks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."push_receipts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_push_tokens" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."knock_replies";









GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";











































































































































































GRANT ALL ON FUNCTION "public"."accept_friend_request"("request_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."accept_friend_request"("request_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."accept_friend_request"("request_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."acknowledge_knock"("recipient_row_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."acknowledge_knock"("recipient_row_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."acknowledge_knock"("recipient_row_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."acknowledge_knock"("recipient_row_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."can_access_knock_reply"("p_knock_id" "uuid", "p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."can_access_knock_reply"("p_knock_id" "uuid", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_access_knock_reply"("p_knock_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_access_knock_reply"("p_knock_id" "uuid", "p_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."can_access_knock_reply_storage"("p_knock_id" "text", "p_user_id" "uuid", "p_upload" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."can_access_knock_reply_storage"("p_knock_id" "text", "p_user_id" "uuid", "p_upload" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."can_access_knock_reply_storage"("p_knock_id" "text", "p_user_id" "uuid", "p_upload" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_access_knock_reply_storage"("p_knock_id" "text", "p_user_id" "uuid", "p_upload" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."can_send_knock_reply"("p_knock_id" "uuid", "p_recipient_row_id" "uuid", "p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."can_send_knock_reply"("p_knock_id" "uuid", "p_recipient_row_id" "uuid", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_send_knock_reply"("p_knock_id" "uuid", "p_recipient_row_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_send_knock_reply"("p_knock_id" "uuid", "p_recipient_row_id" "uuid", "p_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."can_view_knock"("target_knock_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."can_view_knock"("target_knock_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_view_knock"("target_knock_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_view_knock"("target_knock_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."can_view_knock_recipient"("target_knock_id" "uuid", "target_recipient_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."can_view_knock_recipient"("target_knock_id" "uuid", "target_recipient_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_view_knock_recipient"("target_knock_id" "uuid", "target_recipient_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_view_knock_recipient"("target_knock_id" "uuid", "target_recipient_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."cancel_friend_request"("request_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."cancel_friend_request"("request_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cancel_friend_request"("request_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_username_available"("candidate_username" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."is_username_available"("candidate_username" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_username_available"("candidate_username" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."notify_on_knock_created"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."notify_on_knock_created"() TO "service_role";



GRANT ALL ON FUNCTION "public"."reject_friend_request"("request_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."reject_friend_request"("request_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."reject_friend_request"("request_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."send_friend_request"("target_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."send_friend_request"("target_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."send_friend_request"("target_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."send_knock"("target_user_ids" "uuid"[], "alert_text" "text", "custom_message" "text", "knock_priority" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."send_knock"("target_user_ids" "uuid"[], "alert_text" "text", "custom_message" "text", "knock_priority" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."send_knock"("target_user_ids" "uuid"[], "alert_text" "text", "custom_message" "text", "knock_priority" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."send_knock"("target_user_ids" "uuid"[], "alert_text" "text", "custom_message" "text", "knock_priority" "text") TO "service_role";
























GRANT ALL ON TABLE "public"."friend_requests" TO "anon";
GRANT ALL ON TABLE "public"."friend_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."friend_requests" TO "service_role";



GRANT ALL ON TABLE "public"."hidden_knock_activities" TO "anon";
GRANT ALL ON TABLE "public"."hidden_knock_activities" TO "authenticated";
GRANT ALL ON TABLE "public"."hidden_knock_activities" TO "service_role";



GRANT ALL ON TABLE "public"."knock_recipients" TO "anon";
GRANT ALL ON TABLE "public"."knock_recipients" TO "authenticated";
GRANT ALL ON TABLE "public"."knock_recipients" TO "service_role";



GRANT ALL ON TABLE "public"."knock_replies" TO "anon";
GRANT ALL ON TABLE "public"."knock_replies" TO "authenticated";
GRANT ALL ON TABLE "public"."knock_replies" TO "service_role";



GRANT ALL ON TABLE "public"."knock_reply_reads" TO "anon";
GRANT ALL ON TABLE "public"."knock_reply_reads" TO "authenticated";
GRANT ALL ON TABLE "public"."knock_reply_reads" TO "service_role";



GRANT ALL ON TABLE "public"."knocks" TO "anon";
GRANT ALL ON TABLE "public"."knocks" TO "authenticated";
GRANT ALL ON TABLE "public"."knocks" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."push_receipts" TO "anon";
GRANT ALL ON TABLE "public"."push_receipts" TO "authenticated";
GRANT ALL ON TABLE "public"."push_receipts" TO "service_role";



GRANT ALL ON TABLE "public"."user_push_tokens" TO "anon";
GRANT ALL ON TABLE "public"."user_push_tokens" TO "authenticated";
GRANT ALL ON TABLE "public"."user_push_tokens" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































