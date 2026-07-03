alter table public.generated_reviews add column if not exists generation_metadata jsonb not null default '{}'::jsonb;
alter table public.generated_reviews add column if not exists embedding jsonb;

create table if not exists public.keyword_usage_log (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid not null references public.doctors(id) on delete cascade,
  generated_review_id uuid references public.generated_reviews(id) on delete set null,
  usage_type text not null check (usage_type in ('doctor_name','area_name','treatment','superlative')),
  phrase text not null,
  created_at timestamptz not null default now()
);
alter table public.keyword_usage_log enable row level security;
create index if not exists keyword_usage_log_doctor_type_created_idx on public.keyword_usage_log(doctor_id,usage_type,created_at desc);
create index if not exists generated_reviews_doctor_created_idx on public.generated_reviews(doctor_id,created_at desc);

drop policy if exists "owners and admins read keyword usage" on public.keyword_usage_log;
create policy "owners and admins read keyword usage" on public.keyword_usage_log for select using (
  public.is_admin() or exists(select 1 from public.doctors d where d.id=keyword_usage_log.doctor_id and d.auth_user_id=auth.uid())
);
