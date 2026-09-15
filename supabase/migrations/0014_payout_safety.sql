-- ParkPilot: make host payouts safe to operate for real.
--
-- Two problems with the original flow:
--   1. `request-payout` read the available balance and then inserted, with no
--      transaction or lock, so two concurrent requests could both pass the
--      check and over-request the same funds.
--   2. `mark-payout-paid` accepted an operator-supplied tx hash and marked the
--      payout paid without ever checking that the money actually moved.
--
-- (1) is fixed here by moving the check + insert into a single SECURITY DEFINER
-- function that locks the host's ledger account for the duration, so requests
-- for the same host serialise.
-- (2) is fixed in the `mark-payout-paid` edge function, which now verifies the
-- receipt on-chain before settling.

alter table payouts
  add column if not exists block_number bigint;

create index if not exists payouts_status_idx on payouts (status, requested_at);

-- Request a payout atomically -------------------------------------------------
create or replace function request_payout(
  p_host text,
  p_amount numeric,
  p_payout_address text
)
returns table (
  id uuid,
  amount_usdt numeric,
  status text,
  payout_address text,
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
  v_min numeric := 1;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'Enter a valid amount.';
  end if;

  -- Serialise concurrent requests from the same host.
  select a.id
    into v_account_id
    from ledger_accounts a
   where a.owner_type = 'host'
     and lower(a.owner_address) = v_host
     and a.currency = 'USDT'
     for update;

  if v_account_id is null then
    raise exception 'No earnings available to withdraw yet.';
  end if;

  select coalesce(sum(e.amount_usdt), 0)
    into v_earned
    from ledger_entries e
   where e.account_id = v_account_id
     and e.entry_type = 'earning'
     and e.direction = 'credit';

  select coalesce(sum(e.amount_usdt), 0)
    into v_withdrawn
    from ledger_entries e
   where e.account_id = v_account_id
     and e.entry_type = 'payout'
     and e.direction = 'debit';

  select coalesce(sum(p.amount_usdt), 0)
    into v_reserved
    from payouts p
   where lower(p.host_address) = v_host
     and p.status in ('requested', 'processing');

  v_available := greatest(0, v_earned - v_withdrawn - v_reserved);

  select coalesce((s.value #>> '{}')::numeric, 1)
    into v_min
    from platform_settings s
   where s.key = 'min_payout_usdt';

  if p_amount < v_min then
    raise exception 'Minimum payout is % USDT.', v_min;
  end if;

  if p_amount > v_available then
    raise exception 'Amount exceeds your available balance.';
  end if;

  insert into host_wallets (host_address, payout_address, updated_at)
  values (v_host, lower(p_payout_address), now())
  on conflict (host_address) do update
    set payout_address = excluded.payout_address,
        updated_at = now();

  return query
    insert into payouts (host_address, payout_address, amount_usdt, status)
    values (v_host, lower(p_payout_address), p_amount, 'requested')
    returning payouts.id,
              payouts.amount_usdt,
              payouts.status,
              payouts.payout_address,
              payouts.requested_at;
end;
$$;

-- Only the service role (edge functions) may execute this.
revoke all on function request_payout(text, numeric, text) from public, anon, authenticated;
grant execute on function request_payout(text, numeric, text) to service_role;
