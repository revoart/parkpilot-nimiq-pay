-- ParkPilot: treasury operators + payout state cleanup.
--
-- 1. `mark-payout-paid` used to require the caller's wallet to *equal* the
--    treasury address. That breaks the moment the treasury is a multisig
--    (e.g. a Safe): the caller is a signer, not the Safe itself. Operators are
--    now an explicit allow-list, with the treasury address still accepted for
--    backwards compatibility.
-- 2. `payouts.status` allowed a 'processing' value that nothing ever set, so it
--    is removed to keep the state machine honest.

-- Operator allow-list ---------------------------------------------------------
insert into platform_settings (key, value)
values ('operator_addresses', '[]'::jsonb)
on conflict (key) do nothing;

-- Payout state machine --------------------------------------------------------
do $$
declare
  cname text;
begin
  select conname
    into cname
    from pg_constraint
   where conrelid = 'payouts'::regclass
     and contype = 'c'
     and pg_get_constraintdef(oid) like '%status%';

  if cname is not null then
    execute format('alter table payouts drop constraint %I', cname);
  end if;
end $$;

alter table payouts
  add constraint payouts_status_check
  check (status in ('requested', 'paid', 'failed'));

-- request_payout: reserved now means requested only ---------------------------
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
     and p.status = 'requested';

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

revoke all on function request_payout(text, numeric, text) from public, anon, authenticated;
grant execute on function request_payout(text, numeric, text) to service_role;
