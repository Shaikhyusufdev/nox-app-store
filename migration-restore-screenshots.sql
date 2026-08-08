-- Run this if you already ran migration-remove-screenshots.sql earlier and
-- need the screenshots column back (admin panel uploads screenshots again).

alter table apps add column if not exists screenshots text[];
