-- ParkPilot: driver ↔ host messaging, and a dialable phone contact.
--
-- Chat is scoped to a RESERVATION rather than to a pair of wallets. That is the
-- authorization boundary: you may read or post in a thread only if you are the
-- reservation's driver, or the owner of the parking space it booked. It also
-- means a host can only be contacted by someone who actually booked, so a
-- listing never becomes a way to cold-message its owner.
--
-- No RLS policies are created. Like every other private table here, these are
-- reachable only through Edge Functions using the service role, which bypasses
-- RLS — the anon client can never read a message. That is deliberate: the app
-- has no Supabase Auth session, so there is no JWT for a policy to evaluate.

-- Phone contact ---------------------------------------------------------------

alter table profiles add column if not exists phone text;

-- Opt-in, and off by default. A phone number is far more sensitive than
-- anything else stored here, so it is disclosed only when its owner has asked
-- for that AND the person asking has a booking in flight (enforced in the Edge
-- Functions, which are the only readers).
alter table profiles
  add column if not exists phone_shared boolean not null default false;

-- Defence in depth: whatever the functions accept must still look like a phone
-- number. `+` optional, 8–15 digits, which covers E.164 and national formats.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_phone_format'
  ) then
    alter table profiles
      add constraint profiles_phone_format
      check (phone is null or phone ~ '^\+?[0-9]{8,15}$');
  end if;
end $$;

-- Messages --------------------------------------------------------------------

create table if not exists conversation_messages (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references reservations (id) on delete cascade,
  sender_evm_address text not null,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);

-- The only read pattern is "this thread, oldest first", and the poll cursor
-- filters on created_at within one reservation.
create index if not exists conversation_messages_thread_idx
  on conversation_messages (reservation_id, created_at);

-- Read cursor, one row per participant per thread.
--
-- A per-message `read_at` would be the obvious alternative, but with two
-- participants it needs a flag per side; a single cursor per person answers
-- "how many are unread" with one comparison and cannot drift out of sync.
create table if not exists conversation_reads (
  reservation_id uuid not null references reservations (id) on delete cascade,
  evm_address text not null,
  last_read_at timestamptz not null default now(),
  primary key (reservation_id, evm_address)
);

alter table conversation_messages enable row level security;
alter table conversation_reads enable row level security;

-- conversation_messages, conversation_reads: RLS enabled with no policies
-- => denied for anon/authenticated. Access is via Edge Functions only.
