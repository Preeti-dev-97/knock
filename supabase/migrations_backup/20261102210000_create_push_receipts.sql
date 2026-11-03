CREATE TABLE IF NOT EXISTS public.push_receipts (
    ticket_id TEXT PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    expo_push_token TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    checked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_push_receipts_pending
ON public.push_receipts (created_at)
WHERE status = 'pending';

ALTER TABLE public.push_receipts ENABLE ROW LEVEL SECURITY;