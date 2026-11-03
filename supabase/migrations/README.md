Knock Supabase migration
Apply locally
Place `20261102150000_create_knocks.sql` in your repository at:
`supabase/migrations/20261102150000_create_knocks.sql`
Then run:

```bash
supabase migration up
```

For a new Supabase project, link it first:

```bash
supabase login
supabase link --project-ref YOUR_SUPABASE_PROJECT_REF
supabase db push
```

Prerequisite
This migration assumes the existing `public.friend_requests` table has:
`user_low UUID`
`user_high UUID`
`status` with the value `accepted`
It also assumes the app's existing user/profile setup has already been migrated.
Do not manually run this migration in the SQL Editor and then also run it through the
migration CLI on the same database unless you first reconcile the migration history.
Supabase CLI tracks applied migrations in `supabase_migrations.schema_migrations`.
