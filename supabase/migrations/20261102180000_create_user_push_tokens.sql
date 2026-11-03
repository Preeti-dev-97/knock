CREATE TABLE IF NOT EXISTS public.user_push_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    user_id UUID NOT NULL
        REFERENCES auth.users(id)
        ON DELETE CASCADE,

    expo_push_token TEXT NOT NULL UNIQUE,

    platform TEXT NOT NULL
        CHECK (platform IN ('android', 'ios')),

    device_name TEXT,

    created_at TIMESTAMPTZ DEFAULT NOW(),

    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS
    idx_user_push_tokens_user_id
ON public.user_push_tokens(user_id);

ALTER TABLE public.user_push_tokens
ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own push tokens"
ON public.user_push_tokens
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can register their own push tokens"
ON public.user_push_tokens
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own push tokens"
ON public.user_push_tokens
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own push tokens"
ON public.user_push_tokens
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);