-- ParkPilot: one name for the account.
--
-- The app signs in with a Nimiq account, so every `evm_address` column has been
-- holding a Nimiq address since the identity work landed. The names are now a
-- lie, and two of them are worse than that: `reservations` and `profiles` each
-- carried BOTH an `evm_address` and an `nmiq_address` for what is now a single
-- account.
--
-- Both of those duplicate columns are entirely empty — the app never populated
-- them — so this drops the duplicates and renames the surviving column rather
-- than trying to reconcile two spellings of the same thing.
--
-- Historical rows are left alone. Analytics events and pre-Nimiq reservations
-- keep whatever address they were written with; rewriting history to look like
-- something it was not would be worse than a few mixed rows in an audit log.

-- 1. Reservations: the driver's account ---------------------------------------
-- `nmiq_address` was the optional payer address, `evm_address` the required
-- identity. They are the same account now, and only the latter was ever used.

alter table reservations drop column if exists nmiq_address;
alter table reservations rename column evm_address to nimiq_address;

-- 2. Profiles -----------------------------------------------------------------

alter table profiles drop column if exists nmiq_address;
alter table profiles rename column evm_address to nimiq_address;

-- 3. Listings -----------------------------------------------------------------

alter table parking_spaces rename column owner_evm_address to owner_nimiq_address;

-- 4. Sign-in challenges -------------------------------------------------------

alter table auth_challenges rename column evm_address to nimiq_address;

-- 5. Chat ---------------------------------------------------------------------

alter table conversation_messages rename column sender_evm_address to sender_nimiq_address;
alter table conversation_reads rename column evm_address to nimiq_address;

-- 6. Reviews and analytics ----------------------------------------------------

alter table reviews rename column evm_address to nimiq_address;
alter table app_events rename column evm_address to nimiq_address;

-- 7. wallet_identities is superseded ------------------------------------------
-- Nothing writes to it: sign-in lives in `auth_challenges` and the session is a
-- signed token. Its unused `evm_address` goes; the table itself stays so any
-- historical rows remain readable.

alter table wallet_identities drop column if exists evm_address;

-- 8. Index names --------------------------------------------------------------
-- Postgres rewrites an index definition when its column is renamed, but not the
-- index's own name, which would leave `reservations_evm_idx` indexing
-- `nimiq_address`.

alter index if exists reservations_evm_idx rename to reservations_nimiq_idx;

-- 9. Functions that read the renamed columns ----------------------------------
-- The returned column is renamed from owner_evm_address to owner_nimiq_address,
-- and Postgres cannot change a function's OUT row type in place, so this one is
-- dropped and recreated. Grants are restored below.

drop function if exists nearby_parking_spaces(double precision, double precision, integer, integer);

create function nearby_parking_spaces(
  p_lat double precision,
  p_lng double precision,
  p_radius_m integer default 5000,
  p_limit integer default 60
)
returns table (
  id uuid,
  title text,
  description text,
  address text,
  latitude double precision,
  longitude double precision,
  price_nim numeric,
  payment_recipient_address text,
  parking_type text,
  covered boolean,
  ev_charging boolean,
  accessible boolean,
  active boolean,
  created_at timestamptz,
  updated_at timestamptz,
  owner_nimiq_address text,
  image_url text,
  distance_m double precision,
  busy_until timestamptz,
  rating_avg numeric,
  rating_count integer
)
language sql
stable
security invoker
set search_path = public
as $$
  with bounds as (
    select
      p_radius_m::double precision / 111320.0 as d_lat,
      p_radius_m::double precision
        / (111320.0 * greatest(cos(radians(p_lat)), 0.000001)) as d_lng
  ),
  candidates as (
    select
      s.id,
      s.title,
      s.description,
      s.address,
      s.latitude,
      s.longitude,
      s.price_nim,
      s.payment_recipient_address,
      s.parking_type,
      s.covered,
      s.ev_charging,
      s.accessible,
      s.active,
      s.created_at,
      s.updated_at,
      s.owner_nimiq_address,
      s.image_url,
      -- Great-circle distance in metres.
      2 * 6371000.0 * asin(
        least(
          1.0,
          sqrt(
            sin(radians(s.latitude - p_lat) / 2) ^ 2
            + cos(radians(p_lat)) * cos(radians(s.latitude))
              * sin(radians(s.longitude - p_lng) / 2) ^ 2
          )
        )
      ) as distance_m
    from parking_spaces s, bounds b
    where s.active
      and s.latitude between p_lat - b.d_lat and p_lat + b.d_lat
      and s.longitude between p_lng - b.d_lng and p_lng + b.d_lng
  ),
  ratings as (
    select
      r.parking_space_id,
      round(avg(r.rating)::numeric, 2) as rating_avg,
      count(*)::integer as rating_count
    from reviews r
    group by r.parking_space_id
  )
  select
    c.id,
    c.title,
    c.description,
    c.address,
    c.latitude,
    c.longitude,
    c.price_nim,
    c.payment_recipient_address,
    c.parking_type,
    c.covered,
    c.ev_charging,
    c.accessible,
    c.active,
    c.created_at,
    c.updated_at,
    c.owner_nimiq_address,
    c.image_url,
    c.distance_m,
    (
      select max(r.end_at)
      from reservations r
      where r.parking_space_id = c.id
        and r.status in ('reservation_pending', 'reservation_confirmed')
        and r.start_at <= now()
        and r.end_at > now()
    ) as busy_until,
    rt.rating_avg,
    coalesce(rt.rating_count, 0) as rating_count
  from candidates c
  left join ratings rt on rt.parking_space_id = c.id
  where c.distance_m <= p_radius_m
  order by c.distance_m
  limit greatest(1, least(p_limit, 200));
$$;

revoke all on function nearby_parking_spaces(double precision, double precision, integer, integer) from public;
grant execute on function nearby_parking_spaces(double precision, double precision, integer, integer)
  to anon, authenticated, service_role;

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
  left join last on last.reservation_id = mine.id
  -- Threads with messages sort by the newest message; silent ones by booking
  -- date, so a brand-new booking still appears at the top.
  order by coalesce(last.created_at, mine.start_at) desc
  limit 100;
$$;

revoke all on function conversation_summaries(text) from public;
revoke all on function conversation_summaries(text) from anon, authenticated;
grant execute on function conversation_summaries(text) to service_role;
