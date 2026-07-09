create table if not exists public.review_generation_meta (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid not null references public.doctors(id) on delete cascade,
  scan_id uuid references public.scans(id) on delete set null,
  fingerprint_hash text,
  rating integer not null check (rating between 1 and 5),
  is_name_area_prompted boolean not null default false,
  is_language_prompted boolean not null default false,
  is_doctor_name_included boolean not null default false,
  language text not null default 'english',
  strategy text,
  created_at timestamptz not null default now()
);

alter table public.review_generation_meta enable row level security;

create index if not exists review_generation_meta_doctor_created_idx
  on public.review_generation_meta (doctor_id, created_at desc);

create index if not exists review_generation_meta_doctor_flags_created_idx
  on public.review_generation_meta (doctor_id, is_name_area_prompted, is_language_prompted, is_doctor_name_included, created_at desc);

drop policy if exists "owners and admins read generation meta" on public.review_generation_meta;
create policy "owners and admins read generation meta"
on public.review_generation_meta for select
using (
  public.is_admin() or exists (
    select 1 from public.doctors d
    where d.id = review_generation_meta.doctor_id
      and d.auth_user_id = auth.uid()
  )
);
