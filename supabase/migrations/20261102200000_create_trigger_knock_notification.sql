CREATE OR REPLACE FUNCTION public.notify_on_knock_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_secret TEXT;
BEGIN

    SELECT decrypted_secret
    INTO v_secret
    FROM vault.decrypted_secrets
    WHERE name = 'knock_webhook_secret';

    IF v_secret IS NULL THEN
        RAISE WARNING 'Knock webhook secret not configured.';
        RETURN NEW;
    END IF;

    PERFORM net.http_post(
        url := 'https://vnctrrtkyqvhiycacidv.supabase.co/functions/v1/send-knock-notification',

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


DROP TRIGGER IF EXISTS trigger_knock_notification
ON public.knocks;


CREATE TRIGGER trigger_knock_notification
AFTER INSERT ON public.knocks
FOR EACH ROW
EXECUTE FUNCTION public.notify_on_knock_created();