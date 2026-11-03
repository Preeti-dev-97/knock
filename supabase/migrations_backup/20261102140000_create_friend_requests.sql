-- ==========================================
-- KNOCK: FRIEND REQUESTS / CONNECTIONS
-- ==========================================

CREATE TABLE IF NOT EXISTS public.friend_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    requester_id UUID NOT NULL
        REFERENCES auth.users(id) ON DELETE CASCADE,

    addressee_id UUID NOT NULL
        REFERENCES auth.users(id) ON DELETE CASCADE,

    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'accepted', 'rejected', 'cancelled')),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    responded_at TIMESTAMPTZ,

    user_low UUID GENERATED ALWAYS AS (
        LEAST(requester_id, addressee_id)
    ) STORED,

    user_high UUID GENERATED ALWAYS AS (
        GREATEST(requester_id, addressee_id)
    ) STORED,

    CONSTRAINT no_self_request
        CHECK (requester_id <> addressee_id),

    CONSTRAINT unique_connection_pair
        UNIQUE (user_low, user_high)
);

CREATE INDEX IF NOT EXISTS idx_friend_requests_addressee
ON public.friend_requests(addressee_id, status);

CREATE INDEX IF NOT EXISTS idx_friend_requests_requester
ON public.friend_requests(requester_id, status);

ALTER TABLE public.friend_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own requests"
ON public.friend_requests;

CREATE POLICY "Users can view their own requests"
ON public.friend_requests
FOR SELECT
TO authenticated
USING (
    auth.uid() = requester_id
    OR auth.uid() = addressee_id
);

GRANT SELECT ON public.friend_requests TO authenticated;


-- ==========================================
-- SEND CONNECTION REQUEST
-- ==========================================

CREATE OR REPLACE FUNCTION public.send_friend_request(
    target_user_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
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


-- ==========================================
-- ACCEPT REQUEST
-- ==========================================

CREATE OR REPLACE FUNCTION public.accept_friend_request(
    request_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
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


-- ==========================================
-- REJECT REQUEST
-- ==========================================

CREATE OR REPLACE FUNCTION public.reject_friend_request(
    request_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
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


-- ==========================================
-- CANCEL SENT REQUEST
-- ==========================================

CREATE OR REPLACE FUNCTION public.cancel_friend_request(
    request_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
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


-- ==========================================
-- PERMISSIONS
-- ==========================================

GRANT EXECUTE ON FUNCTION public.send_friend_request(UUID)
TO authenticated;

GRANT EXECUTE ON FUNCTION public.accept_friend_request(UUID)
TO authenticated;

GRANT EXECUTE ON FUNCTION public.reject_friend_request(UUID)
TO authenticated;

GRANT EXECUTE ON FUNCTION public.cancel_friend_request(UUID)
TO authenticated;