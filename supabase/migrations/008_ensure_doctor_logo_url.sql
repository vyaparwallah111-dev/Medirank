-- Safe for both fresh and legacy projects.
alter table public.doctors add column if not exists logo_url text;
