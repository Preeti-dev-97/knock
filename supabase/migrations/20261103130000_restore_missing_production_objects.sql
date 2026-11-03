-- Restore the auth.users signup trigger.
-- The handle_new_user() function already exists in the baseline migration.

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_trigger
        WHERE tgname = 'on_auth_user_created'
          AND tgrelid = 'auth.users'::regclass
          AND NOT tgisinternal
    ) THEN
        CREATE TRIGGER on_auth_user_created
        AFTER INSERT ON auth.users
        FOR EACH ROW
        EXECUTE FUNCTION public.handle_new_user();
    END IF;
END
$$;


-- Ensure the private Knock reply media bucket exists.

INSERT INTO storage.buckets (id, name, public)
VALUES ('knock-replies', 'knock-replies', false)
ON CONFLICT (id) DO NOTHING;


-- Restore storage upload policy.

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'storage'
          AND tablename = 'objects'
          AND policyname = 'Upload knock replies'
    ) THEN
        CREATE POLICY "Upload knock replies"
        ON storage.objects
        FOR INSERT
        TO authenticated
        WITH CHECK (
            bucket_id = 'knock-replies'
            AND array_length(storage.foldername(name), 1) = 2
            AND (storage.foldername(name))[2] = (SELECT auth.uid())::text
            AND public.can_access_knock_reply_storage(
                (storage.foldername(name))[1],
                (SELECT auth.uid()),
                true
            )
        );
    END IF;
END
$$;


-- Restore storage view policy.

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'storage'
          AND tablename = 'objects'
          AND policyname = 'View knock replies media'
    ) THEN
        CREATE POLICY "View knock replies media"
        ON storage.objects
        FOR SELECT
        TO authenticated
        USING (
            bucket_id = 'knock-replies'
            AND public.can_access_knock_reply_storage(
                (storage.foldername(name))[1],
                (SELECT auth.uid()),
                false
            )
        );
    END IF;
END
$$;


-- Add tables used by Home and History realtime subscriptions.

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = 'knocks'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.knocks;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = 'knock_recipients'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.knock_recipients;
    END IF;
END
$$;
