-- ==========================================
-- 1. KNOCK REPLIES TABLE
-- ==========================================

CREATE TABLE IF NOT EXISTS public.knock_replies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    knock_id UUID NOT NULL
        REFERENCES public.knocks(id) ON DELETE CASCADE,

    recipient_row_id UUID NOT NULL
        REFERENCES public.knock_recipients(id) ON DELETE CASCADE,

    sender_id UUID NOT NULL
        REFERENCES auth.users(id) ON DELETE CASCADE,

    reply_type TEXT NOT NULL
        CHECK (reply_type IN ('text', 'image', 'audio')),

    message TEXT,

    media_path TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT valid_knock_reply_content CHECK (
        (
            reply_type = 'text'
            AND message IS NOT NULL
            AND length(trim(message)) > 0
            AND length(message) <= 2000
            AND media_path IS NULL
        )
        OR
        (
            reply_type IN ('image', 'audio')
            AND media_path IS NOT NULL
            AND length(media_path) > 0
            AND (message IS NULL OR length(message) <= 2000)
        )
    )
);

CREATE INDEX IF NOT EXISTS idx_knock_replies_knock_id
ON public.knock_replies(knock_id, created_at);

CREATE INDEX IF NOT EXISTS idx_knock_replies_sender_id
ON public.knock_replies(sender_id);


-- ==========================================
-- 2. SECURITY HELPER FUNCTIONS
-- ==========================================

CREATE OR REPLACE FUNCTION public.can_access_knock_reply(
    p_knock_id UUID,
    p_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
STABLE
SET search_path = ''
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


CREATE OR REPLACE FUNCTION public.can_send_knock_reply(
    p_knock_id UUID,
    p_recipient_row_id UUID,
    p_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.knock_recipients kr
        WHERE kr.id = p_recipient_row_id
        AND kr.knock_id = p_knock_id
        AND kr.recipient_id = p_user_id
    );
$$;

REVOKE ALL ON FUNCTION public.can_access_knock_reply(UUID, UUID)
FROM PUBLIC;

REVOKE ALL ON FUNCTION public.can_send_knock_reply(UUID, UUID, UUID)
FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.can_access_knock_reply(UUID, UUID)
TO authenticated;

GRANT EXECUTE ON FUNCTION public.can_send_knock_reply(UUID, UUID, UUID)
TO authenticated;


-- ==========================================
-- 3. ROW LEVEL SECURITY
-- ==========================================

ALTER TABLE public.knock_replies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view knock replies"
ON public.knock_replies;

CREATE POLICY "Users can view knock replies"
ON public.knock_replies
FOR SELECT
TO authenticated
USING (
    public.can_access_knock_reply(knock_id, (SELECT auth.uid()))
);


DROP POLICY IF EXISTS "Recipients can send knock replies"
ON public.knock_replies;

CREATE POLICY "Recipients can send knock replies"
ON public.knock_replies
FOR INSERT
TO authenticated
WITH CHECK (
    sender_id = (SELECT auth.uid())
    AND public.can_send_knock_reply(
        knock_id,
        recipient_row_id,
        (SELECT auth.uid())
    )
);

GRANT SELECT, INSERT ON public.knock_replies
TO authenticated;


-- ==========================================
-- 4. PRIVATE STORAGE BUCKET
-- ==========================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('knock-replies', 'knock-replies', false)
ON CONFLICT (id)
DO UPDATE SET public = false;


-- ==========================================
-- 5. STORAGE ACCESS HELPER
-- ==========================================

CREATE OR REPLACE FUNCTION public.can_access_knock_reply_storage(
    p_knock_id TEXT,
    p_user_id UUID,
    p_upload BOOLEAN DEFAULT FALSE
)
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
STABLE
SET search_path = ''
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

REVOKE ALL ON FUNCTION
public.can_access_knock_reply_storage(TEXT, UUID, BOOLEAN)
FROM PUBLIC;

GRANT EXECUTE ON FUNCTION
public.can_access_knock_reply_storage(TEXT, UUID, BOOLEAN)
TO authenticated;


-- ==========================================
-- 6. STORAGE POLICIES
-- ==========================================

DROP POLICY IF EXISTS "Upload knock replies"
ON storage.objects;

CREATE POLICY "Upload knock replies"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'knock-replies'
    AND array_length(storage.foldername(name), 1) >= 3
    AND (storage.foldername(name))[2] = (SELECT auth.uid())::TEXT
    AND public.can_access_knock_reply_storage(
        (storage.foldername(name))[1],
        (SELECT auth.uid()),
        TRUE
    )
);


DROP POLICY IF EXISTS "View knock replies media"
ON storage.objects;

CREATE POLICY "View knock replies media"
ON storage.objects
FOR SELECT
TO authenticated
USING (
    bucket_id = 'knock-replies'
    AND public.can_access_knock_reply_storage(
        (storage.foldername(name))[1],
        (SELECT auth.uid()),
        FALSE
    )
);