-- Run this in Supabase: Dashboard > SQL Editor > New Query
-- Adds an icon_url column so each app can have a real uploaded icon
-- instead of just a letter badge.

alter table apps add column if not exists icon_url text;
