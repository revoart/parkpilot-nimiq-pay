-- ParkPilot: remove the demo catalogue.
--
-- Eight Toronto listings (ids `11111111-…`), their photos and their reviews were
-- seeded so the driver experience matched the design. They are not real spaces,
-- and the reviews are invented people with invented quotes shown in the UI as
-- genuine ratings. Both go.
--
-- Order matters: `reservations.parking_space_id` is `on delete restrict`, so a
-- listing with bookings cannot be deleted until they are gone. Everything that
-- hangs off a reservation — payments, conversation messages, read cursors —
-- cascades from `reservations`, and reviews and availability cascade from the
-- listing, so only reservations need deleting explicitly.
--
-- Photos live in Storage and are removed separately through the Storage API.
-- Deleting the row in `storage.objects` would leave the file orphaned in the
-- bucket, still publicly readable.

delete from reservations
 where parking_space_id::text like '11111111-%';

delete from parking_spaces
 where id::text like '11111111-%';
