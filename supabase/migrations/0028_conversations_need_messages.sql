-- Conversations are messages, not bookings.
--
-- `conversation_summaries` listed every reservation the caller was party to and
-- left-joined messages onto it, so the inbox filled with bookings nobody had
-- spoken about. The left join was deliberate — a comment explained that silent
-- threads sorted by booking date so a new booking still appeared — but that made
-- the inbox double as a bookings list, which is not what it is for.
--
-- An inner join means only threads that actually have messages appear. Chat is
-- started from the booking itself: the parking pass for a driver, the bookings
-- screen for a host.
--
-- Messages also expire. A conversation is deleted 24 hours after its last
-- message, so the window is "24 hours of silence", not "24 hours from booking" —
-- an active conversation stays alive, and an abandoned one goes.

create or replace function public.conversation_summaries(p_owner text)
 returns table(
   reservation_id uuid,
   is_driver boolean,
   driver_address text,
   host_address text,
   space_title text,
   space_image_url text,
   status text,
   start_at timestamp with time zone,
   end_at timestamp with time zone,
   last_message_at timestamp with time zone,
   last_message_body text,
   last_message_sender text,
   unread_count integer
 )
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  with mine as (
    select
      r.id,
      r.nimiq_address as driver_address,
      ps.owner_nimiq_address as host_address,
      ps.title,
      ps.image_url,
      r.status,
      r.start_at,
      r.end_at,
      lower(r.nimiq_address) = lower(p_owner) as is_driver
    from reservations r
    join parking_spaces ps on ps.id = r.parking_space_id
    where lower(r.nimiq_address) = lower(p_owner)
       or lower(ps.owner_nimiq_address) = lower(p_owner)
  ),
  last as (
    select distinct on (m.reservation_id)
      m.reservation_id,
      m.created_at,
      m.body,
      m.sender_nimiq_address
    from conversation_messages m
    order by m.reservation_id, m.created_at desc
  ),
  my_read as (
    select cr.reservation_id, cr.last_read_at
    from conversation_reads cr
    where lower(cr.nimiq_address) = lower(p_owner)
  )
  select
    mine.id,
    mine.is_driver,
    mine.driver_address,
    mine.host_address,
    mine.title,
    mine.image_url,
    mine.status::text,
    mine.start_at,
    mine.end_at,
    last.created_at,
    last.body,
    last.sender_nimiq_address,
    coalesce((
      select count(*)::integer
      from conversation_messages m2
      where m2.reservation_id = mine.id
        -- Only the other side's messages can be unread.
        and lower(m2.sender_nimiq_address) <> lower(p_owner)
        and m2.created_at > coalesce(
          (select r2.last_read_at from my_read r2 where r2.reservation_id = mine.id),
          'epoch'::timestamptz
        )
    ), 0) as unread_count
  from mine
  -- Inner join: a reservation with no messages is not a conversation.
  join last on last.reservation_id = mine.id
  -- A conversation ends 24 hours after its last message.
  where last.created_at > now() - interval '24 hours'
  order by last.created_at desc
  limit 100;
$function$;

-- Delete expired messages rather than only hiding them, so the content is gone
-- rather than merely unreachable.
create or replace function public.expire_conversation_messages()
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  removed integer;
begin
  delete from conversation_messages
  where created_at < now() - interval '24 hours';
  get diagnostics removed = row_count;

  delete from conversation_reads
  where reservation_id not in (select distinct reservation_id from conversation_messages);

  return removed;
end;
$function$;

grant execute on function public.expire_conversation_messages() to service_role;

-- Run hourly. `cron.schedule` is idempotent by job name, so re-running this
-- migration updates the existing job rather than adding a second one.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule(
      'expire-conversation-messages',
      '0 * * * *',
      $cron$select public.expire_conversation_messages();$cron$
    );
  end if;
end
$$;
