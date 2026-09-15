-- ParkPilot demo reviews.
-- Clearly demo content so the driver experience matches the design's review
-- and rating sections. Replace with real reviews once drivers start rating.

alter table reviews
  add column if not exists reviewer_name text;

insert into reviews (id, parking_space_id, reviewer_name, rating, comment, created_at) values
  ('22222222-2222-4222-8222-000000000101', '11111111-1111-4111-8111-111111111101', 'Alex M.', 5, 'Easy access, great price. Exactly what the app showed.', now() - interval '6 days'),
  ('22222222-2222-4222-8222-000000000102', '11111111-1111-4111-8111-111111111101', 'Sarah K.', 5, 'Super convenient. Space was ready when I arrived.', now() - interval '12 days'),
  ('22222222-2222-4222-8222-000000000103', '11111111-1111-4111-8111-111111111101', 'Dan R.', 4, 'Clean and well lit. Tight ramp on the way in.', now() - interval '20 days'),

  ('22222222-2222-4222-8222-000000000201', '11111111-1111-4111-8111-111111111102', 'Priya S.', 5, 'Right under the mall. Paid in seconds with USDT.', now() - interval '3 days'),
  ('22222222-2222-4222-8222-000000000202', '11111111-1111-4111-8111-111111111102', 'Marcus L.', 4, 'Good location, a bit busy on weekends.', now() - interval '9 days'),

  ('22222222-2222-4222-8222-000000000301', '11111111-1111-4111-8111-111111111103', 'Elena V.', 5, 'EV charger worked first try. Very smooth.', now() - interval '2 days'),
  ('22222222-2222-4222-8222-000000000302', '11111111-1111-4111-8111-111111111103', 'Tom H.', 5, 'Premium spot, felt secure the whole time.', now() - interval '14 days'),

  ('22222222-2222-4222-8222-000000000401', '11111111-1111-4111-8111-111111111104', 'Grace N.', 4, 'Perfect for the game. Short walk to the arena.', now() - interval '5 days'),
  ('22222222-2222-4222-8222-000000000402', '11111111-1111-4111-8111-111111111104', 'Omar F.', 4, 'Easy in and out. Would reserve again.', now() - interval '11 days'),

  ('22222222-2222-4222-8222-000000000501', '11111111-1111-4111-8111-111111111105', 'Nina P.', 4, 'Great value for King West. Bright and open.', now() - interval '7 days'),
  ('22222222-2222-4222-8222-000000000502', '11111111-1111-4111-8111-111111111105', 'Chris B.', 3, 'Fine spot, entrance was a little hard to find.', now() - interval '18 days'),

  ('22222222-2222-4222-8222-000000000601', '11111111-1111-4111-8111-111111111106', 'Leah D.', 5, 'Cheapest option near the Distillery. Worked great.', now() - interval '4 days'),
  ('22222222-2222-4222-8222-000000000602', '11111111-1111-4111-8111-111111111106', 'Jon W.', 4, 'Simple flat lot. Good for a day out.', now() - interval '15 days'),

  ('22222222-2222-4222-8222-000000000701', '11111111-1111-4111-8111-111111111107', 'Amara T.', 5, 'Steps from the water. Covered and clean.', now() - interval '8 days'),
  ('22222222-2222-4222-8222-000000000702', '11111111-1111-4111-8111-111111111107', 'Felix G.', 4, 'Handy for the ferry. Would use again.', now() - interval '21 days'),

  ('22222222-2222-4222-8222-000000000801', '11111111-1111-4111-8111-111111111108', 'Rina C.', 5, 'Accessible space was genuinely easy to use.', now() - interval '1 day'),
  ('22222222-2222-4222-8222-000000000802', '11111111-1111-4111-8111-111111111108', 'Victor A.', 4, 'Modern garage, quick payment. Recommended.', now() - interval '10 days')
on conflict (id) do nothing;
