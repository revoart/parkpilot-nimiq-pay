-- ParkPilot: the last EVM-shaped leftovers.
--
-- Two things survived the move to Nimiq because nothing forced them out. Both
-- are now dead, and leaving them would keep a false idea of how the system
-- works in the schema.

-- 1. The nonce ----------------------------------------------------------------
-- Nimiq has no nonce. What guards a transaction is its 120-block validity
-- window, plus the network refusing an identical transaction it has already
-- accepted. The column the EVM signer used to sequence sends means nothing here,
-- and nothing reads it: the signed bytes recorded in `raw_tx` are the replay
-- guard.

alter table payouts drop column if exists send_nonce;

-- 2. wallet_identities --------------------------------------------------------
-- Superseded twice over. Sign-in challenges live in `auth_challenges`, and the
-- session is a self-contained signed token, so no identity table is consulted at
-- all. It holds no rows and nothing writes to it — its only remaining role was
-- appearing in generated types.

drop table if exists wallet_identities;
