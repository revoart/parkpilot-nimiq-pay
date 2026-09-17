-- ParkPilot: give the platform its own Nimiq account.
--
-- The treasury was previously set to the operator's personal Nimiq Pay address.
-- That collapses two different roles into one account: the platform's receiving
-- account, and a user's wallet. Nimiq forbids a transaction whose sender equals
-- its recipient ("Sender Equals Recipient"), so the operator could not drive on
-- their own marketplace — every booking would be a payment to themselves.
--
-- The user-wallet architecture is unchanged and stays exactly as designed:
-- one user, one Nimiq Pay account, one real balance. Driver and Host remain
-- application roles over that single wallet. What changes is that the platform
-- now has its own address, distinct from any user's.
--
-- This address holds no key here and needs no balance to RECEIVE driver
-- payments. It only needs funding before hosts can be paid out, and its key
-- lives outside the repository (TREASURY_MNEMONIC_FILE) for the local signer.

update platform_settings
   set value = '"NQ478EESP5JGLGKELC9G51AB6NT2CD3BXK41"'::jsonb,
       updated_at = now()
 where key = 'treasury_address';
