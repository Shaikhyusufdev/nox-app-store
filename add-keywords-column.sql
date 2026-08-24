-- Run this in Supabase: Dashboard > SQL Editor > New Query
-- Adds a "keywords" column so each app can be SEO-tagged individually
-- (e.g. "video downloader, mp3 converter, offline"), used in the
-- per-app page's <meta name="keywords"> tag and JSON-LD schema.

alter table apps add column if not exists keywords text;
