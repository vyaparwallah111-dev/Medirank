create table if not exists public.doctor_ai_settings (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid not null unique references public.doctors(id) on delete cascade,
  target_keywords jsonb not null default '{"high":[],"medium":[],"low":[]}'::jsonb,
  target_areas jsonb not null default '{"primary":[],"secondary":[]}'::jsonb,
  patient_concerns jsonb not null default '[]'::jsonb,
  usp_points jsonb not null default '[]'::jsonb,
  tone_preference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.doctor_ai_settings enable row level security;

create index if not exists doctor_ai_settings_doctor_idx
  on public.doctor_ai_settings (doctor_id);

drop policy if exists "owners and admins read ai settings" on public.doctor_ai_settings;
create policy "owners and admins read ai settings"
on public.doctor_ai_settings for select
using (
  public.is_admin() or exists (
    select 1 from public.doctors d
    where d.id = doctor_ai_settings.doctor_id
      and d.auth_user_id = auth.uid()
  )
);

drop policy if exists "owners and admins write ai settings" on public.doctor_ai_settings;
create policy "owners and admins write ai settings"
on public.doctor_ai_settings for all
using (
  public.is_admin() or exists (
    select 1 from public.doctors d
    where d.id = doctor_ai_settings.doctor_id
      and d.auth_user_id = auth.uid()
  )
)
with check (
  public.is_admin() or exists (
    select 1 from public.doctors d
    where d.id = doctor_ai_settings.doctor_id
      and d.auth_user_id = auth.uid()
  )
);

create table if not exists public.system_error_logs (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid references public.doctors(id) on delete set null,
  endpoint text not null,
  error_message text not null,
  severity text not null default 'error' check (severity in ('info','warning','error','critical')),
  created_at timestamptz not null default now()
);

alter table public.system_error_logs enable row level security;

create index if not exists system_error_logs_created_idx
  on public.system_error_logs (created_at desc);

create index if not exists system_error_logs_doctor_created_idx
  on public.system_error_logs (doctor_id, created_at desc);

drop policy if exists "admins read system error logs" on public.system_error_logs;
create policy "admins read system error logs"
on public.system_error_logs for select
using (public.is_admin());

revoke insert, update, delete on public.system_error_logs from anon, authenticated;
