-- ParkPilot: review schema. (demo rows removed)
--
-- The `reviewer_name` column below is still required — the app reads it — so
-- this migration keeps the schema change.
--
-- It also used to insert seventeen demo reviews: invented people ("Alex M.",
-- "Sarah K.", "Priya S.") with invented quotes, rendered in the UI as genuine
-- ratings. Those rows were deleted by `0021_remove_demo_catalogue.sql`, and the
-- insert is removed here so a rebuild cannot resurrect them. Ratings now come
-- only from reviews a real driver leaves.

alter table reviews
  add column if not exists reviewer_name text;
