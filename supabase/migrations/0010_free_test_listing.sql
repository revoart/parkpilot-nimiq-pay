-- ParkPilot: free ($0.00) demo listing.
-- Lets the reservation -> pass flow be exercised end to end without an
-- on-chain payment. `price_usdt = 0` is allowed by the schema
-- (check price_usdt >= 0) and the backend treats a zero total as a free
-- reservation: it is confirmed immediately and no payment/ledger rows are made.

insert into parking_spaces (
  id, title, description, address, latitude, longitude, price_usdt,
  payment_recipient_address, owner_evm_address, parking_type,
  covered, ev_charging, accessible, active
) values (
  '11111111-1111-4111-8111-111111111110',
  'Free Test Spot (Demo)',
  'Free demo listing for testing the reservation flow. No payment is taken.',
  '1 Free Demo Ln, Toronto, ON',
  43.6509, -79.3832, 0,
  '0xE4C5d04f359316f6AEa754F7ed7Edc0b38d0083F',
  '0xE4C5d04f359316f6AEa754F7ed7Edc0b38d0083F',
  'lot', false, false, true, true
)
on conflict (id) do update set
  title = excluded.title,
  description = excluded.description,
  address = excluded.address,
  latitude = excluded.latitude,
  longitude = excluded.longitude,
  price_usdt = excluded.price_usdt,
  payment_recipient_address = excluded.payment_recipient_address,
  owner_evm_address = excluded.owner_evm_address,
  parking_type = excluded.parking_type,
  covered = excluded.covered,
  ev_charging = excluded.ev_charging,
  accessible = excluded.accessible,
  active = excluded.active,
  updated_at = now();
