-- ParkPilot wallet authentication.
-- A one-time EIP-712 signature is exchanged for a short-lived session token.
-- Write endpoints derive the acting wallet from the token, never from the
-- request body, so a caller can only act as a wallet they control.

create table if not exists auth_challenges (
  id uuid primary key default gen_random_uuid(),
  evm_address text not null,
  nonce text not null,
  expires_at timestamptz not null,
  used boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists auth_challenges_lookup_idx
  on auth_challenges (lower(evm_address), nonce);

create index if not exists auth_challenges_expiry_idx
  on auth_challenges (expires_at);

alter table auth_challenges enable row level security;

-- No anon/authenticated policies: only Edge Functions (service role) touch it.

-- Cleanup helper for expired/used challenges.
create or replace function expire_auth_challenges()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  affected integer;
begin
  delete from auth_challenges
   where expires_at < now() - interval '1 hour' or used = true;
  get diagnostics affected = row_count;
  return affected;
end;
$$;

grant execute on function expire_auth_challenges() to service_role;
