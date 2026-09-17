-- ParkPilot: remove the second-wallet concepts.
--
-- There is one Nimiq wallet per user. A user's wallet is their Nimiq Pay
-- account; "driver", "host" and "treasury" are application roles and accounting
-- classifications, not additional wallets.
--
-- Three things in the schema implied otherwise. All three are dropped here.

-- 1. host_wallets -------------------------------------------------------------
-- A free-text payout destination, which could be any address the host typed —
-- a genuinely different wallet. It is not needed: a payout goes to the host's
-- own Nimiq account, which is the address that owns the listing.
--
-- Empty, and written only by `request_payout`.

drop table if exists host_wallets;

-- 2. payouts.payout_address ---------------------------------------------------
-- Snapshot of the above. The destination is now the host account itself, so a
-- separate column would only invite the two to disagree.

alter table payouts drop column if exists payout_address;

-- 3. parking_spaces.payment_recipient_address ---------------------------------
-- Set to the host's address when a listing is created, then never used to route
-- anything: every payment goes to the platform treasury, and hosts are credited
-- through the ledger. It implied a direct-to-host model the app does not use.

alter table parking_spaces drop column if exists payment_recipient_address;

-- 4. Functions that referenced the dropped columns ----------------------------
-- OUT row types change, so each is dropped and recreated; grants are restored.

drop function if exists request_payout(text, numeric, text);

create function request_payout(
  p_host text,
  p_amount numeric
)
returns table (
  id uuid,
  amount_nim numeric,
  status text,
  requested_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_host text := lower(p_host);
  v_account_id uuid;
  v_earned numeric := 0;
  v_withdrawn numeric := 0;
  v_reserved numeric := 0;
  v_available numeric;
  v_min numeric := 5000;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'Enter a valid amount.';
  end if;

  select a.id
    into v_account_id
    from ledger_accounts a
   where a.owner_type = 'host'
     and lower(a.owner_address) = v_host
     and a.currency = 'NIM'
     for update;

  if v_account_id is null then
    raise exception 'No earnings available to withdraw yet.';
  end if;

  select coalesce(sum(e.amount_nim), 0)
    into v_earned
    from ledger_entries e
   where e.account_id = v_account_id
     and e.entry_type = 'earning'
     and e.direction = 'credit';

  select coalesce(sum(e.amount_nim), 0)
    into v_withdrawn
    from ledger_entries e
   where e.account_id = v_account_id
     and e.entry_type = 'payout'
     and e.direction = 'debit';

  select coalesce(sum(p.amount_nim), 0)
    into v_reserved
    from payouts p
   where lower(p.host_address) = v_host
     and p.status = 'requested';

  v_available := greatest(0, v_earned - v_withdrawn - v_reserved);

  select coalesce((s.value #>> '{}')::numeric, 5000)
    into v_min
    from platform_settings s
   where s.key = 'min_payout_nim';

  if p_amount < v_min then
    raise exception 'Minimum payout is % NIM.', v_min;
  end if;

  if p_amount > v_available then
    raise exception 'Amount exceeds your available balance.';
  end if;

  return query
    insert into payouts (host_address, amount_nim, status)
    values (v_host, p_amount, 'requested')
    returning payouts.id,
              payouts.amount_nim,
              payouts.status,
              payouts.requested_at;
end;
$$;

revoke all on function request_payout(text, numeric) from public, anon, authenticated;
grant execute on function request_payout(text, numeric) to service_role;

drop function if exists claim_payout_for_send(uuid);

create function claim_payout_for_send(p_payout_id uuid)
returns table (
  id uuid,
  host_address text,
  amount_nim numeric,
  requested_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enabled boolean := false;
  v_max numeric := 250000;
  v_daily numeric := 1250000;
  v_amount numeric;
  v_status text;
  v_in_flight integer;
  v_recent numeric := 0;
begin
  select coalesce((s.value #>> '{}')::boolean, false)
    into v_enabled
    from platform_settings s
   where s.key = 'payouts_enabled';

  if not coalesce(v_enabled, false) then
    raise exception 'Payout sending is disabled.';
  end if;

  select p.status, p.amount_nim
    into v_status, v_amount
    from payouts p
   where p.id = p_payout_id;

  if v_status is null then
    raise exception 'Payout not found.';
  end if;
  if v_status = 'paid' then
    raise exception 'That payout is already paid.';
  end if;
  if v_status <> 'requested' then
    raise exception 'That payout is not awaiting a send.';
  end if;

  -- Excluding this payout so a resume of an already-claimed send is not blocked
  -- by itself.
  select count(*)
    into v_in_flight
    from payouts p
   where p.status = 'sending'
     and p.id <> p_payout_id;

  if v_in_flight > 0 then
    raise exception 'A payout is already in progress. Finish or resume it first.';
  end if;

  select coalesce((s.value #>> '{}')::numeric, 250000)
    into v_max
    from platform_settings s
   where s.key = 'max_payout_nim';

  if v_amount > v_max then
    raise exception 'Payout exceeds the per-payout limit of % NIM.', v_max;
  end if;

  select coalesce((s.value #>> '{}')::numeric, 1250000)
    into v_daily
    from platform_settings s
   where s.key = 'daily_payout_cap_nim';

  select coalesce(sum(p.amount_nim), 0)
    into v_recent
    from payouts p
   where p.status in ('sending', 'paid')
     and p.requested_at > now() - interval '24 hours'
     and p.id <> p_payout_id;

  if v_recent + v_amount > v_daily then
    raise exception
      'Daily payout limit of % NIM would be exceeded (% already committed in the last 24 hours).',
      v_daily, v_recent;
  end if;

  return query
    update payouts p
       set status = 'sending',
           send_attempted_at = now(),
           failure_reason = null
     where p.id = p_payout_id
       and p.status = 'requested'
    returning p.id,
              p.host_address,
              p.amount_nim,
              p.requested_at;
end;
$$;

revoke all on function claim_payout_for_send(uuid) from public, anon, authenticated;
grant execute on function claim_payout_for_send(uuid) to service_role;

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
