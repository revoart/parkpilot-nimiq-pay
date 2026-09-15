-- ParkPilot Row Level Security
-- The public (anon) client may only read the parking catalogue and insert
-- anonymous analytics events. Every write path for reservations, payments and
-- wallet identities goes through Edge Functions using the service role, which
-- bypasses RLS.

alter table profiles enable row level security;
alter table parking_spaces enable row level security;
alter table parking_space_photos enable row level security;
alter table parking_availability enable row level security;
alter table reservations enable row level security;
alter table payments enable row level security;
alter table wallet_identities enable row level security;
alter table payment_events enable row level security;
alter table reviews enable row level security;
alter table app_events enable row level security;

-- Catalogue: public read-only ------------------------------------------------
drop policy if exists "public read active parking spaces" on parking_spaces;
create policy "public read active parking spaces"
  on parking_spaces for select
  to anon, authenticated
  using (active = true);

drop policy if exists "public read parking photos" on parking_space_photos;
create policy "public read parking photos"
  on parking_space_photos for select
  to anon, authenticated
  using (true);

drop policy if exists "public read parking availability" on parking_availability;
create policy "public read parking availability"
  on parking_availability for select
  to anon, authenticated
  using (true);

drop policy if exists "public read reviews" on reviews;
create policy "public read reviews"
  on reviews for select
  to anon, authenticated
  using (true);

-- Analytics: insert-only ------------------------------------------------------
drop policy if exists "anon insert app events" on app_events;
create policy "anon insert app events"
  on app_events for insert
  to anon, authenticated
  with check (true);

-- reservations, payments, wallet_identities, payment_events, profiles:
-- RLS enabled with no policies => denied for anon/authenticated.
-- Access is via Edge Functions (service role) only.
