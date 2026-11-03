-- User profiles
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    username TEXT NOT NULL,
    full_name TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Unique usernames (case insensitive)
CREATE UNIQUE INDEX profiles_username_unique
ON public.profiles (LOWER(username));

-- Enable Row Level Security
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Authenticated users can view profiles
CREATE POLICY "Authenticated users can view profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (true);

-- Users can update their own profiles
CREATE POLICY "Users can update own profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- Automatically create profile after signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
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

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_user();

-- Check username availability
CREATE OR REPLACE FUNCTION public.is_username_available(
    candidate_username TEXT
)
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT NOT EXISTS (
        SELECT 1
        FROM public.profiles
        WHERE LOWER(username) = LOWER(candidate_username)
    );
$$;

GRANT EXECUTE ON FUNCTION public.is_username_available(TEXT)
TO anon, authenticated;