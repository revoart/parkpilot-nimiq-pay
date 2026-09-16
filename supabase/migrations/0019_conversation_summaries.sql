-- ParkPilot: the conversation list, computed in the database.
--
-- The alternative is fetching every message for every one of the caller's
-- reservations and reducing in the Edge Function, which grows without bound as
-- a thread fills up. This returns one row per thread — last message plus an
-- exact unread count — so the payload is proportional to the number of
-- bookings, not the number of messages.
--
-- SECURITY DEFINER with a pinned search_path, and execute revoked from
-- anon/authenticated: only the service role (Edge Functions) may call it, which
-- is what keeps the caller's wallet address trustworthy.

create or replace function conversation_summaries(p_owner text)
returns table (
  reservation_id uuid,
  is_driver boolean,
  driver_address text,
  host_address text,
  space_title text,
  space_image_url text,
  status text,
  start_at timestamptz,
  end_at timestamptz,
  last_message_at timestamptz,
  last_message_body text,
  last_message_sender text,
  unread_count integer
)
language sql
stable
security definer
set search_path = public
as $$
  with mine as (
    select
      r.id,
      r.evm_address as driver_address,
      ps.owner_evm_address as host_address,
      ps.title,
      ps.image_url,
      r.status,
      r.start_at,
      r.end_at,
      lower(r.evm_address) = lower(p_owner) as is_driver
    from reservations r
    join parking_spaces ps on ps.id = r.parking_space_id
    where lower(r.evm_address) = lower(p_owner)
       or lower(ps.owner_evm_address) = lower(p_owner)
  ),
  last as (
    select distinct on (m.reservation_id)
      m.reservation_id,
      m.created_at,
      m.body,
      m.sender_evm_address
    from conversation_messages m
    order by m.reservation_id, m.created_at desc
  ),
  my_read as (
    select cr.reservation_id, cr.last_read_at
    from conversation_reads cr
    where lower(cr.evm_address) = lower(p_owner)
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
    last.sender_evm_address,
    coalesce((
      select count(*)::integer
      from conversation_messages m2
      where m2.reservation_id = mine.id
        -- Only the other side's messages can be unread.
        and lower(m2.sender_evm_address) <> lower(p_owner)
        and m2.created_at > coalesce(
          (select r2.last_read_at from my_read r2 where r2.reservation_id = mine.id),
          'epoch'::timestamptz
        )
    ), 0) as unread_count
  from mine
  left join last on last.reservation_id = mine.id
  -- Threads with messages sort by the newest message; silent ones by booking
  -- date, so a brand-new booking still appears at the top.
  order by coalesce(last.created_at, mine.start_at) desc
  limit 100;
$$;

revoke all on function conversation_summaries(text) from public;
revoke all on function conversation_summaries(text) from anon, authenticated;
grant execute on function conversation_summaries(text) to service_role;
