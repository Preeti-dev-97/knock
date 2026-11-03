-- Fix circular RLS dependencies between knocks and knock_recipients.

-- Check whether the current user can view a Knock.
-- SECURITY DEFINER bypasses the table's normal RLS policies.
create or replace function public.can_view_knock(
  target_knock_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
set row_security = off
as $$
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


-- Check whether the current user can view a recipient record.
-- The recipient can view their own record.
-- The original sender can view all recipient records for their Knock.
create or replace function public.can_view_knock_recipient(
  target_knock_id uuid,
  target_recipient_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
set row_security = off
as $$
  select
    target_recipient_id = (select auth.uid())
    or exists (
      select 1
      from public.knocks k
      where k.id = target_knock_id
        and k.sender_id = (select auth.uid())
    );
$$;


-- Restrict helper function execution to authenticated users.
revoke all on function public.can_view_knock(uuid) from public;
revoke all on function public.can_view_knock_recipient(uuid, uuid) from public;

grant execute on function public.can_view_knock(uuid) to authenticated;
grant execute on function public.can_view_knock_recipient(uuid, uuid) to authenticated;


-- Remove the existing policies on these two tables.
-- The current Knock implementation uses SECURITY DEFINER RPCs for writes.
do $$
declare
  policy_record record;
begin
  for policy_record in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('knocks', 'knock_recipients')
  loop
    execute format(
      'drop policy %I on %I.%I',
      policy_record.policyname,
      policy_record.schemaname,
      policy_record.tablename
    );
  end loop;
end;
$$;


-- Recreate non-recursive SELECT policies.
create policy "Users can view their own knocks"
on public.knocks
for select
to authenticated
using (
  public.can_view_knock(id)
);


create policy "Users can view their knock recipient records"
on public.knock_recipients
for select
to authenticated
using (
  public.can_view_knock_recipient(knock_id, recipient_id)
);