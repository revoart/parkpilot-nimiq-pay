-- ParkPilot: safe, scripted treasury sends for host payouts.
--
-- Payouts were settled by an operator sending USDT by hand and then reporting
-- the hash to `mark-payout-paid`. This migration adds the state a local signer
-- needs to do that send without ever risking a double payment.
--
-- The key idea: a signed transaction is deterministic — its hash is
-- keccak256(rawTx) — so the signer stores the signed bytes BEFORE broadcasting.
-- If it dies in between, a retry re-broadcasts the identical bytes (same hash,
-- harmless) instead of signing a fresh transaction and paying twice. Without
-- that, every retry is a potential double-spend.

alter table payouts
  add column if not exists send_nonce bigint,
  add column if not exists raw_tx text,
  add column if not exists send_attempted_at timestamptz,
  add column if not exists failure_reason text;

-- `sending` is the in-flight state. It has to exist for the claim in
-- `claim_payout_for_send` to be atomic: one UPDATE either takes the payout or
-- finds it already taken.
alter table payouts drop constraint if exists payouts_status_check;
alter table payouts
  add constraint payouts_status_check
  check (status in ('requested', 'sending', 'paid', 'failed'));

create index if not exists payouts_sending_idx
  on payouts (status) where status = 'sending';

-- Audit trail -----------------------------------------------------------------

create table if not exists payout_events (
  id uuid primary key default gen_random_uuid(),
  payout_id uuid not null references payouts (id) on delete cascade,
  -- claimed | signed | broadcast | confirmed | failed
  event text not null,
  detail jsonb,
  created_at timestamptz not null default now()
);

create index if not exists payout_events_payout_idx
  on payout_events (payout_id, created_at);

alter table payout_events enable row level security;
-- No policies: service role (Edge Functions) only, as with every other private
-- table here.

-- Settings --------------------------------------------------------------------

-- Off by default. Nothing can be sent until an operator deliberately arms it,
-- so a misconfigured deploy cannot start moving funds on its own.
insert into platform_settings (key, value) values
  ('payouts_enabled', 'false'::jsonb),
  ('max_payout_usdt', '100'::jsonb),
  ('daily_payout_cap_usdt', '500'::jsonb)
on conflict (key) do nothing;

-- Claim ----------------------------------------------------------------------

-- Takes a payout from 'requested' to 'sending', enforcing the kill switch, the
-- caps and single-flight in one transaction.
--
-- Single-flight is global on purpose. Two sends running at once would take the
-- same nonce from the treasury account and one would be dropped or replace the
-- other. At this volume, serialising sends costs nothing and removes the whole
-- class of problem.
create or replace function claim_payout_for_send(p_payout_id uuid)
returns table (
  id uuid,
  host_address text,
  payout_address text,
  amount_usdt numeric,
  requested_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enabled boolean := false;
  v_max numeric := 100;
  v_daily numeric := 500;
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

  select p.status, p.amount_usdt
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

  select coalesce((s.value #>> '{}')::numeric, 100)
    into v_max
    from platform_settings s
   where s.key = 'max_payout_usdt';

  if v_amount > v_max then
    raise exception 'Payout exceeds the per-payout limit of % USDT.', v_max;
  end if;

  select coalesce((s.value #>> '{}')::numeric, 500)
    into v_daily
    from platform_settings s
   where s.key = 'daily_payout_cap_usdt';

  select coalesce(sum(p.amount_usdt), 0)
    into v_recent
    from payouts p
   where p.status in ('sending', 'paid')
     and p.requested_at > now() - interval '24 hours'
     and p.id <> p_payout_id;

  if v_recent + v_amount > v_daily then
    raise exception
      'Daily payout limit of % USDT would be exceeded (% already committed in the last 24 hours).',
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
              p.payout_address,
              p.amount_usdt,
              p.requested_at;
end;
$$;

revoke all on function claim_payout_for_send(uuid) from public, anon, authenticated;
grant execute on function claim_payout_for_send(uuid) to service_role;
