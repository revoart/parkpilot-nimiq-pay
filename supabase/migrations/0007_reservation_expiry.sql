-- ParkPilot reservation expiry.
-- Unpaid (pending) reservations must not block inventory forever.

do $$
begin
  if not exists (
    select 1
    from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'reservation_status'
      and e.enumlabel = 'reservation_expired'
  ) then
    alter type reservation_status add value 'reservation_expired';
  end if;
end $$;

alter table reservations
  add column if not exists expires_at timestamptz;

-- Pending reservations get a 15-minute payment window by default.
create or replace function set_reservation_expiry()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'reservation_pending' and new.expires_at is null then
    new.expires_at = now() + interval '15 minutes';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_reservations_expiry on reservations;
create trigger trg_reservations_expiry
  before insert on reservations
  for each row execute function set_reservation_expiry();

create index if not exists reservations_pending_expiry_idx
  on reservations (expires_at)
  where status = 'reservation_pending';

-- Expire abandoned pending reservations so their slots are released.
create or replace function expire_stale_reservations()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  affected integer;
begin
  update reservations
     set status = 'reservation_expired',
         updated_at = now()
   where status = 'reservation_pending'
     and expires_at is not null
     and expires_at < now();

  get diagnostics affected = row_count;
  return affected;
end;
$$;

grant execute on function expire_stale_reservations() to anon, authenticated, service_role;
