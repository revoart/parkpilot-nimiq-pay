-- ParkPilot host availability.
-- Weekly recurring schedule per listing (matches the design's day picker),
-- plus the existing per-date parking_availability table for exceptions.

create table if not exists parking_availability_rules (
  id uuid primary key default gen_random_uuid(),
  parking_space_id uuid not null references parking_spaces (id) on delete cascade,
  weekday int not null check (weekday between 0 and 6),
  start_time time not null,
  end_time time not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint parking_availability_rules_time_valid check (end_time > start_time)
);

create index if not exists parking_availability_rules_space_idx
  on parking_availability_rules (parking_space_id, weekday);

alter table parking_availability_rules enable row level security;

-- Public read (the driver app needs to know when a listing is available).
drop policy if exists "public read parking availability rules" on parking_availability_rules;
create policy "public read parking availability rules"
  on parking_availability_rules for select
  to anon, authenticated
  using (true);

-- Writes go through the set-availability Edge Function (service role).

-- Seed weekly rules for every existing listing: available 07:00-23:00 daily.
insert into parking_availability_rules (
  parking_space_id, weekday, start_time, end_time, active
)
select
  s.id,
  d.weekday,
  '07:00'::time,
  '23:00'::time,
  true
from parking_spaces s
cross join generate_series(0, 6) as d(weekday)
where not exists (
  select 1
  from parking_availability_rules r
  where r.parking_space_id = s.id and r.weekday = d.weekday
);
