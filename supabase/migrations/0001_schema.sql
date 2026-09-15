-- ParkPilot schema
-- Extensions -----------------------------------------------------------------
create extension if not exists pgcrypto;
create extension if not exists btree_gist;

-- Enums ----------------------------------------------------------------------
do $$
begin
  create type reservation_status as enum (
    'reservation_pending',
    'reservation_confirmed',
    'reservation_cancelled',
    'reservation_completed'
  );
exception when duplicate_object then null;
end $$;

do $$
begin
  create type payment_status as enum (
    'payment_pending',
    'payment_submitted',
    'payment_verifying',
    'payment_confirmed',
    'payment_failed',
    'payment_expired'
  );
exception when duplicate_object then null;
end $$;

-- profiles -------------------------------------------------------------------
create table if not exists profiles (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  display_name text,
  email text,
  nmiq_address text,
  evm_address text
);

-- parking_spaces -------------------------------------------------------------
create table if not exists parking_spaces (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  address text not null,
  latitude double precision not null,
  longitude double precision not null,
  price_usdt numeric(18, 6) not null check (price_usdt >= 0),
  payment_recipient_address text not null,
  parking_type text,
  covered boolean not null default false,
  ev_charging boolean not null default false,
  accessible boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists parking_spaces_location_idx
  on parking_spaces (latitude, longitude);
create index if not exists parking_spaces_active_idx
  on parking_spaces (active);

-- parking_space_photos -------------------------------------------------------
create table if not exists parking_space_photos (
  id uuid primary key default gen_random_uuid(),
  parking_space_id uuid not null references parking_spaces (id) on delete cascade,
  storage_path text not null,
  sort_order int not null default 0
);

create index if not exists parking_space_photos_space_idx
  on parking_space_photos (parking_space_id);

-- parking_availability -------------------------------------------------------
create table if not exists parking_availability (
  id uuid primary key default gen_random_uuid(),
  parking_space_id uuid not null references parking_spaces (id) on delete cascade,
  date date not null,
  start_time time not null,
  end_time time not null,
  available boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists parking_availability_space_idx
  on parking_availability (parking_space_id, date);

-- reservations ---------------------------------------------------------------
create table if not exists reservations (
  id uuid primary key default gen_random_uuid(),
  parking_space_id uuid not null references parking_spaces (id) on delete restrict,
  user_id uuid references profiles (id) on delete set null,
  evm_address text not null,
  nmiq_address text,
  start_at timestamptz not null,
  end_at timestamptz not null,
  amount_usdt numeric(18, 6) not null check (amount_usdt >= 0),
  status reservation_status not null default 'reservation_pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reservations_time_valid check (end_at > start_at)
);

create index if not exists reservations_evm_idx
  on reservations (lower(evm_address), created_at desc);
create index if not exists reservations_space_time_idx
  on reservations (parking_space_id, start_at, end_at);

-- Availability lock: no two active reservations may overlap on the same space.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'reservations_no_overlap'
  ) then
    alter table reservations
      add constraint reservations_no_overlap
      exclude using gist (
        parking_space_id with =,
        tstzrange(start_at, end_at, '[)') with &&
      )
      where (status in ('reservation_pending', 'reservation_confirmed'));
  end if;
end $$;

-- payments -------------------------------------------------------------------
create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references reservations (id) on delete cascade,
  chain text not null default 'polygon',
  token text not null default 'USDT',
  token_contract text not null,
  sender_address text not null,
  recipient_address text not null,
  amount_raw numeric(78, 0) not null,
  amount_usdt numeric(18, 6) not null,
  tx_hash text not null,
  status payment_status not null default 'payment_pending',
  submitted_at timestamptz,
  confirmed_at timestamptz,
  block_number bigint,
  created_at timestamptz not null default now()
);

-- Idempotency: a transaction hash can only ever be recorded once.
create unique index if not exists payments_tx_hash_unique
  on payments (lower(tx_hash));
create index if not exists payments_reservation_idx
  on payments (reservation_id);

-- wallet_identities ----------------------------------------------------------
create table if not exists wallet_identities (
  id uuid primary key default gen_random_uuid(),
  evm_address text,
  nmiq_address text,
  public_key text,
  signature text,
  challenge text,
  verified_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists wallet_identities_nmiq_idx
  on wallet_identities (nmiq_address);

-- payment_events -------------------------------------------------------------
create table if not exists payment_events (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid references payments (id) on delete cascade,
  event_type text not null,
  payload jsonb,
  created_at timestamptz not null default now()
);

create index if not exists payment_events_payment_idx
  on payment_events (payment_id, created_at desc);

-- reviews --------------------------------------------------------------------
create table if not exists reviews (
  id uuid primary key default gen_random_uuid(),
  parking_space_id uuid not null references parking_spaces (id) on delete cascade,
  evm_address text,
  rating int not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now()
);

create index if not exists reviews_space_idx
  on reviews (parking_space_id, created_at desc);

-- app_events -----------------------------------------------------------------
create table if not exists app_events (
  id uuid primary key default gen_random_uuid(),
  event_name text not null,
  anonymous_device_id text,
  evm_address text,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index if not exists app_events_name_idx
  on app_events (event_name, created_at desc);

-- updated_at trigger ---------------------------------------------------------
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_parking_spaces_updated on parking_spaces;
create trigger trg_parking_spaces_updated
  before update on parking_spaces
  for each row execute function set_updated_at();

drop trigger if exists trg_reservations_updated on reservations;
create trigger trg_reservations_updated
  before update on reservations
  for each row execute function set_updated_at();
