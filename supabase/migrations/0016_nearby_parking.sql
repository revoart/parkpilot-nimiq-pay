-- ParkPilot: real geographic discovery.
--
-- Discovery used to fetch up to 100 listings and filter them in the browser, so
-- "within 5 km" was a client-side guess and unrelated listings leaked into the
-- map and list. The radius now runs in the database, using a bounding box to
-- hit the existing (latitude, longitude) index and an exact haversine to trim
-- the box down to a true circle.
--
-- `busy_until` is a real availability signal derived from the *same* rule the
-- reservation EXCLUDE constraint uses (pending/confirmed reservations), so there
-- is no second availability implementation to drift.

create or replace function nearby_parking_spaces(
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
  price_usdt numeric,
  payment_recipient_address text,
  parking_type text,
  covered boolean,
  ev_charging boolean,
  accessible boolean,
  active boolean,
  created_at timestamptz,
  updated_at timestamptz,
  owner_evm_address text,
  image_url text,
  distance_m double precision,
  busy_until timestamptz
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
      s.price_usdt,
      s.payment_recipient_address,
      s.parking_type,
      s.covered,
      s.ev_charging,
      s.accessible,
      s.active,
      s.created_at,
      s.updated_at,
      s.owner_evm_address,
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
  )
  select
    c.id,
    c.title,
    c.description,
    c.address,
    c.latitude,
    c.longitude,
    c.price_usdt,
    c.payment_recipient_address,
    c.parking_type,
    c.covered,
    c.ev_charging,
    c.accessible,
    c.active,
    c.created_at,
    c.updated_at,
    c.owner_evm_address,
    c.image_url,
    c.distance_m,
    (
      select max(r.end_at)
      from reservations r
      where r.parking_space_id = c.id
        and r.status in ('reservation_pending', 'reservation_confirmed')
        and r.start_at <= now()
        and r.end_at > now()
    ) as busy_until
  from candidates c
  where c.distance_m <= p_radius_m
  order by c.distance_m
  limit greatest(1, least(p_limit, 200));
$$;

revoke all on function nearby_parking_spaces(double precision, double precision, integer, integer) from public;
grant execute on function nearby_parking_spaces(double precision, double precision, integer, integer)
  to anon, authenticated, service_role;
