-- OPTIONAL demo data for local testing / acceptance checks. Do not load in production.
-- Course details below are placeholders and deliberately UNVERIFIED, so the AI
-- will not present them as facts. Replace with real, verified data in Admin.
begin;
insert into public.universities (id, name, country, city, notes) values
  ('d0000000-0000-4000-a000-000000000001', 'Demo University A', 'UK', 'Demo City', 'DEMO DATA'),
  ('d0000000-0000-4000-a000-000000000002', 'Demo University B', 'UK', 'Demo Town', 'DEMO DATA')
on conflict (id) do nothing;
insert into public.courses (id, university_id, name, level) values
  ('d0000000-0000-4000-b000-000000000001', 'd0000000-0000-4000-a000-000000000001', 'MSc Business Analytics', 'Postgraduate'),
  ('d0000000-0000-4000-b000-000000000002', 'd0000000-0000-4000-a000-000000000002', 'MSc Project Management', 'Postgraduate'),
  ('d0000000-0000-4000-b000-000000000003', 'd0000000-0000-4000-a000-000000000002', 'MBA', 'Postgraduate')
on conflict (id) do nothing;
commit;
