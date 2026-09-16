-- ParkPilot: cached NIM/USDT rate.
--
-- Prices are stored in NIM, but NIM is worth a fraction of a cent, so a listing
-- priced at "5000" is meaningless to a host or driver without a dollar figure
-- beside it. This table holds the rate that powers that equivalent.
--
-- Caching here rather than in the client matters for two reasons:
--
--   * The public price APIs rate-limit per IP. One shared cached fetch serves
--     every user instead of each client calling out and tripping the limit.
--
--   * It guarantees a driver and a host looking at the same listing see the
--     same number. Per-client fetches would let two people see different
--     equivalents for the same price at the same moment.
--
-- Single row by construction: the check on `id` means only one rate can exist.

create table if not exists nim_price_cache (
  id boolean primary key default true check (id),
  -- USDT per 1 NIM. Numeric, never a float: this multiplies money.
  rate_usdt numeric(18, 10) not null check (rate_usdt > 0),
  fetched_at timestamptz not null default now(),
  -- Which venues answered, and what each said, so a surprising rate can be
  -- traced back to its sources.
  sources jsonb
);

alter table nim_price_cache enable row level security;
-- No policies: service role (Edge Functions) only, as with every other private
-- table here. Clients read the rate through the `nim-price` function.
