-- Run this in Supabase: Dashboard > SQL Editor > New Query

create table apps (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  version text,
  size text,
  rating numeric,
  description text,
  screenshots text[],
  apk_url text not null,
  created_at timestamp with time zone default now()
);

-- Allow public read access to apps table
alter table apps enable row level security;
create policy "Public read access" on apps for select using (true);

-- Note: inserts/deletes go through the backend using the service_role key,
-- which bypasses RLS, so no insert/delete policy is needed for the public role.

-- After running this, go to Storage in the Supabase dashboard and create ONE
-- PUBLIC bucket named exactly:
--   screenshots
-- (No bucket needed for the APK itself — that's just a link you paste in.)
