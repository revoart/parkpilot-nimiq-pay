-- ParkPilot treasury, internal ledger and host payouts.
-- Funds are non-custodial at the key level: the platform never stores a private
-- key. Drivers pay the ParkPilot treasury; the ledger credits the host's
-- balance (net of the platform fee); payouts are executed to the host's payout
-- address and recorded here.

-- Platform configuration (fee, treasury address, payout floor) --------------
create table if not exists platform_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

insert into platform_settings (key, value) values
  ('platform_fee_bps', '1000'::jsonb),
  ('treasury_address', '"0xE4C5d04f359316f6AEa754F7ed7Edc0b38d0083F"'::jsonb),
  ('min_payout_usdt', '1'::jsonb)
on conflict (key) do nothing;

alter table platform_settings enable row level security;

-- Ledger ---------------------------------------------------------------------
create table if not exists ledger_accounts (
  id uuid primary key default gen_random_uuid(),
  owner_type text not null check (owner_type in ('host', 'treasury')),
  owner_address text not null,
  currency text not null default 'USDT',
  created_at timestamptz not null default now()
);

create unique index if not exists ledger_accounts_unique_idx
  on ledger_accounts (owner_type, lower(owner_address), currency);

create table if not exists ledger_entries (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references ledger_accounts (id) on delete cascade,
  reservation_id uuid references reservations (id) on delete set null,
  payment_id uuid references payments (id) on delete set null,
  entry_type text not null check (entry_type in ('earning', 'fee', 'payout', 'refund', 'adjustment')),
  direction text not null check (direction in ('credit', 'debit')),
  amount_usdt numeric(18, 6) not null check (amount_usdt >= 0),
  amount_raw numeric(78, 0) not null,
  created_at timestamptz not null default now()
);

create index if not exists ledger_entries_account_idx
  on ledger_entries (account_id, created_at desc);

-- A payment can only be credited once per entry type (idempotent posting).
create unique index if not exists ledger_entries_payment_type_unique
  on ledger_entries (payment_id, entry_type)
  where payment_id is not null;

alter table ledger_accounts enable row level security;
alter table ledger_entries enable row level security;

-- Host payout wallets --------------------------------------------------------
create table if not exists host_wallets (
  host_address text primary key,
  payout_address text not null,
  updated_at timestamptz not null default now()
);

alter table host_wallets enable row level security;

-- Payout requests ------------------------------------------------------------
create table if not exists payouts (
  id uuid primary key default gen_random_uuid(),
  host_address text not null,
  payout_address text not null,
  amount_usdt numeric(18, 6) not null check (amount_usdt > 0),
  status text not null default 'requested'
    check (status in ('requested', 'processing', 'paid', 'failed')),
  tx_hash text,
  requested_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists payouts_host_idx on payouts (lower(host_address), requested_at desc);
create unique index if not exists payouts_tx_hash_unique on payouts (lower(tx_hash)) where tx_hash is not null;

alter table payouts enable row level security;

-- Link payout debits to their payout (idempotent posting) ---------------------
alter table ledger_entries
  add column if not exists payout_id uuid references payouts (id) on delete set null;

create unique index if not exists ledger_entries_payout_unique
  on ledger_entries (payout_id)
  where payout_id is not null;

-- Reservation money breakdown ------------------------------------------------
alter table reservations
  add column if not exists recipient_address text,
  add column if not exists host_amount_usdt numeric(18, 6),
  add column if not exists fee_amount_usdt numeric(18, 6);

-- Backfill existing rows: the whole amount went to the listing recipient.
update reservations r
   set recipient_address = ps.payment_recipient_address,
       host_amount_usdt = r.amount_usdt,
       fee_amount_usdt = 0
  from parking_spaces ps
 where ps.id = r.parking_space_id
   and r.recipient_address is null;
