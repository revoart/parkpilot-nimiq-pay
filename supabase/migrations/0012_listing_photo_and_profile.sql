-- ParkPilot: mandatory listing photo + shared profile identity.
--
-- Listings carry exactly ONE photo. The smallest possible schema addition is a
-- single `image_url` on `parking_spaces`; the older (unused) `parking_space_photos`
-- table is intentionally left alone — it models multi-photo galleries, which the
-- product explicitly does not want.
--
-- Storage: a public `parking-photos` bucket. Objects live under the owner's
-- wallet address (`{owner}/{uuid}.{ext}`) so an Edge Function can prove the
-- caller owns the listing before writing. Reads are public (listing photos are
-- public by nature); writes go through the service role only, which bypasses
-- storage RLS — the anon client can never write.

alter table parking_spaces
  add column if not exists image_url text;

alter table profiles
  add column if not exists avatar_url text;

alter table profiles
  add column if not exists bio text;

-- Storage bucket --------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('parking-photos', 'parking-photos', true)
on conflict (id) do update set public = true;

-- Public read for listing photos and avatars.
drop policy if exists "public read parking photos" on storage.objects;
create policy "public read parking photos"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'parking-photos');

-- No insert/update/delete policies: only the service role (Edge Functions) may
-- write to this bucket, which is what enforces host ownership.
