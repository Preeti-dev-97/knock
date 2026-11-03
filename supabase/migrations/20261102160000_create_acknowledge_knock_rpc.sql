-- Allow recipients to acknowledge Knocks they received.

create or replace function public.acknowledge_knock(
  recipient_row_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_count integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  update public.knock_recipients
  set
    status = 'acknowledged',
    acknowledged_at = coalesce(acknowledged_at, now())
  where id = recipient_row_id
    and recipient_id = auth.uid()
    and status in ('sent', 'delivered');

  get diagnostics updated_count = row_count;

  return updated_count = 1;
end;
$$;

revoke all on function public.acknowledge_knock(uuid) from public;

grant execute
on function public.acknowledge_knock(uuid)
to authenticated;

