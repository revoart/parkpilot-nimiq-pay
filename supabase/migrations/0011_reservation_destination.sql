-- ParkPilot: persist the driver's destination alongside the reservation.
-- Parking is not the end of the journey — the app must still be able to show
-- "4 min walk to Toronto Eaton Centre" after payment, so the reservation keeps a
-- stable snapshot of the destination the driver actually searched for.
--
-- All columns are nullable: browsing without a destination stays supported, and
-- we only ever store what the user explicitly searched for (no location history).

alter table reservations
  add column if not exists destination_name text,
  add column if not exists destination_address text,
  add column if not exists destination_lat double precision,
  add column if not exists destination_lng double precision;

-- Only meaningful when a name and coordinates were captured together.
alter table reservations
  drop constraint if exists reservations_destination_valid;

alter table reservations
  add constraint reservations_destination_valid check (
    (destination_name is null and destination_lat is null and destination_lng is null)
    or (destination_name is not null and destination_lat is not null and destination_lng is not null)
  );

create index if not exists reservations_destination_idx
  on reservations (destination_lat, destination_lng)
  where destination_lat is not null;
