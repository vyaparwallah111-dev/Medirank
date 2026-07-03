alter table public.doctors add column if not exists latitude double precision;
alter table public.doctors add column if not exists longitude double precision;
alter table public.doctors add column if not exists daily_review_cap integer not null default 3;
alter table public.doctors drop constraint if exists doctors_daily_review_cap_check;
alter table public.doctors add constraint doctors_daily_review_cap_check check (daily_review_cap between 1 and 100);
alter table public.doctors drop constraint if exists doctors_latitude_check;
alter table public.doctors add constraint doctors_latitude_check check (latitude is null or latitude between -90 and 90);
alter table public.doctors drop constraint if exists doctors_longitude_check;
alter table public.doctors add constraint doctors_longitude_check check (longitude is null or longitude between -180 and 180);

create table if not exists public.device_fingerprints (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid not null references public.doctors(id) on delete cascade,
  fingerprint_hash text not null,
  location_verified boolean,
  distance_meters integer,
  generated_at timestamptz not null default now(),
  unique(doctor_id,fingerprint_hash)
);
alter table public.device_fingerprints enable row level security;
create index if not exists device_fingerprints_recent_idx on public.device_fingerprints(doctor_id,generated_at desc);

create table if not exists public.review_generation_events (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid not null references public.doctors(id) on delete cascade,
  fingerprint_hash text not null,
  personality text not null,
  location_verified boolean,
  distance_meters integer,
  created_at timestamptz not null default now()
);
alter table public.review_generation_events enable row level security;
create index if not exists review_generation_events_daily_idx on public.review_generation_events(doctor_id,created_at desc);

drop policy if exists "owners and admins read generation events" on public.review_generation_events;
create policy "owners and admins read generation events" on public.review_generation_events for select using (
  public.is_admin() or exists(select 1 from public.doctors d where d.id=review_generation_events.doctor_id and d.auth_user_id=auth.uid())
);
