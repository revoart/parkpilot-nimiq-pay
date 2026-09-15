-- ParkPilot host ownership.
-- Listings gain an explicit owner (the host's EVM wallet). Existing demo
-- listings are backfilled from their payment recipient so the host dashboard
-- has content out of the box.

alter table parking_spaces
  add column if not exists owner_evm_address text;

create index if not exists parking_spaces_owner_idx
  on parking_spaces (lower(owner_evm_address));

update parking_spaces
  set owner_evm_address = payment_recipient_address
  where owner_evm_address is null;
