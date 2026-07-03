alter table public.doctors add column if not exists plan_started_at timestamptz;
alter table public.doctors add column if not exists plan_expires_at timestamptz;

update public.doctors d set
  plan_started_at = coalesce(d.plan_started_at, (select p.created_at from public.payments p where p.doctor_id=d.id and p.status='success' order by p.created_at desc limit 1)),
  plan_expires_at = coalesce(d.plan_expires_at, (select p.created_at + interval '30 days' from public.payments p where p.doctor_id=d.id and p.status='success' order by p.created_at desc limit 1))
where d.subscription_tier in ('growth','premium');

create table if not exists public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references auth.users(id),
  doctor_id uuid not null references public.doctors(id) on delete cascade,
  action text not null check (action in ('plan_changed','scans_reset','account_activated','account_suspended')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.admin_audit_logs enable row level security;
drop policy if exists "admins read audit logs" on public.admin_audit_logs;
create policy "admins read audit logs" on public.admin_audit_logs for select using (public.is_admin());

create index if not exists scans_doctor_created_at_idx on public.scans(doctor_id, created_at desc);
create index if not exists admin_audit_logs_doctor_created_at_idx on public.admin_audit_logs(doctor_id, created_at desc);
