-- Knock feature migration
-- Creates Knock records, per-recipient delivery state, and the atomic send RPC.
-- Prerequisite: public.friend_requests must exist with user_low, user_high,
-- and status columns, and accepted friend relationships must use status='accepted'.

BEGIN;

-- ---------------------------------------------------------------------------
-- Knocks
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.knocks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    alert TEXT,
    message VARCHAR(160),
    priority TEXT NOT NULL DEFAULT 'normal'
        CHECK (priority IN ('normal', 'urgent')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT knock_content_required CHECK (
        NULLIF(TRIM(COALESCE(alert, '')), '') IS NOT NULL
        OR NULLIF(TRIM(COALESCE(message, '')), '') IS NOT NULL
    )
);

CREATE INDEX IF NOT EXISTS idx_knocks_sender_created
    ON public.knocks (sender_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Knock recipients
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.knock_recipients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    knock_id UUID NOT NULL
        REFERENCES public.knocks(id) ON DELETE CASCADE,
    recipient_id UUID NOT NULL
        REFERENCES auth.users(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'sent'
        CHECK (status IN ('sent', 'delivered', 'acknowledged')),
    delivered_at TIMESTAMPTZ,
    acknowledged_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_knock_recipient UNIQUE (knock_id, recipient_id)
);

CREATE INDEX IF NOT EXISTS idx_knock_recipients_user_created
    ON public.knock_recipients (recipient_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_knock_recipients_knock
    ON public.knock_recipients (knock_id);

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

ALTER TABLE public.knocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knock_recipients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their knocks" ON public.knocks;
CREATE POLICY "Users can view their knocks"
    ON public.knocks
    FOR SELECT
    TO authenticated
    USING (
        sender_id = (SELECT auth.uid())
        OR EXISTS (
            SELECT 1
            FROM public.knock_recipients AS kr
            WHERE kr.knock_id = knocks.id
              AND kr.recipient_id = (SELECT auth.uid())
        )
    );

DROP POLICY IF EXISTS "Users can view knock recipients"
    ON public.knock_recipients;
CREATE POLICY "Users can view knock recipients"
    ON public.knock_recipients
    FOR SELECT
    TO authenticated
    USING (
        recipient_id = (SELECT auth.uid())
        OR EXISTS (
            SELECT 1
            FROM public.knocks AS k
            WHERE k.id = knock_recipients.knock_id
              AND k.sender_id = (SELECT auth.uid())
        )
    );

GRANT SELECT ON public.knocks TO authenticated;
GRANT SELECT ON public.knock_recipients TO authenticated;

-- ---------------------------------------------------------------------------
-- Atomic send function
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.send_knock(
    target_user_ids UUID[],
    alert_text TEXT DEFAULT NULL,
    custom_message TEXT DEFAULT NULL,
    knock_priority TEXT DEFAULT 'normal'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
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

    IF target_user_ids IS NULL
       OR cardinality(target_user_ids) = 0 THEN
        RAISE EXCEPTION 'Select at least one recipient.';
    END IF;

    IF cardinality(target_user_ids) > 100 THEN
        RAISE EXCEPTION 'You can send a Knock to a maximum of 100 recipients.';
    END IF;

    IF v_alert IS NULL AND v_message IS NULL THEN
        RAISE EXCEPTION 'Choose an alert or enter a message.';
    END IF;

    IF char_length(v_message) > 160 THEN
        RAISE EXCEPTION 'Message cannot exceed 160 characters.';
    END IF;

    IF v_priority NOT IN ('normal', 'urgent') THEN
        RAISE EXCEPTION 'Invalid Knock priority.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM unnest(target_user_ids) AS t(user_id)
        WHERE t.user_id IS NULL OR t.user_id = v_sender
    ) THEN
        RAISE EXCEPTION 'Invalid recipient selection.';
    END IF;

    SELECT COUNT(DISTINCT t.user_id)
      INTO v_requested_count
      FROM unnest(target_user_ids) AS t(user_id);

    -- All recipients must have an accepted friendship with the sender.
    SELECT COUNT(DISTINCT t.user_id)
      INTO v_valid_count
      FROM unnest(target_user_ids) AS t(user_id)
      INNER JOIN public.friend_requests AS fr
        ON fr.user_low = LEAST(v_sender, t.user_id)
       AND fr.user_high = GREATEST(v_sender, t.user_id)
       AND fr.status = 'accepted';

    IF v_valid_count <> v_requested_count THEN
        RAISE EXCEPTION 'One or more recipients are not accepted contacts.';
    END IF;

    INSERT INTO public.knocks (sender_id, alert, message, priority)
    VALUES (v_sender, v_alert, v_message, v_priority)
    RETURNING id INTO v_knock_id;

    INSERT INTO public.knock_recipients (knock_id, recipient_id)
    SELECT v_knock_id, recipients.user_id
    FROM (
        SELECT DISTINCT t.user_id
        FROM unnest(target_user_ids) AS t(user_id)
    ) AS recipients;

    RETURN v_knock_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.send_knock(UUID[], TEXT, TEXT, TEXT)
    FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.send_knock(UUID[], TEXT, TEXT, TEXT)
    TO authenticated;

COMMIT;
