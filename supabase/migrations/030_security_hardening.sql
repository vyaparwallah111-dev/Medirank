-- Migration 030: Security Hardening & Complete Database Setup

-- 1. Create auth_otps table if not exists
create table if not exists public.auth_otps (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  otp_code varchar(6) not null,
  expires_at timestamptz not null,
  is_verified boolean not null default false,
  attempts smallint not null default 0 check (attempts between 0 and 5),
  ip_address text,
  created_at timestamptz not null default now()
);

create index if not exists auth_otps_email_created_idx on public.auth_otps (email, created_at desc);
create index if not exists auth_otps_ip_created_at_idx on public.auth_otps (ip_address, created_at desc);
alter table public.auth_otps enable row level security;
revoke all on table public.auth_otps from anon, authenticated;

-- 2. Ensure plan columns exist on doctors table
alter table public.doctors add column if not exists plan_started_at timestamptz;
alter table public.doctors add column if not exists plan_expires_at timestamptz;
alter table public.doctors add column if not exists is_admin boolean not null default false;
alter table public.doctors add column if not exists total_scans_used bigint not null default 0;

-- 3. Update payments table check constraint for duration plans (if payments table exists)
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'payments') then
    alter table public.payments drop constraint if exists payments_plan_check;
    alter table public.payments add constraint payments_plan_check 
      check (plan in ('1-month', '3-month', '6-month', '1-year', 'growth', 'premium', 'trial'));
  end if;
end $$;

-- 4. Privilege Escalation Guard Trigger on doctors table
create or replace function public.protect_doctor_critical_columns()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (auth.role() = 'authenticated' and not public.is_admin()) then
    new.is_admin := old.is_admin;
    new.subscription_tier := old.subscription_tier;
    new.plan := old.plan;
    new.plan_started_at := old.plan_started_at;
    new.plan_expires_at := old.plan_expires_at;
    new.total_scans_used := old.total_scans_used;
    new.is_active := old.is_active;
    new.auth_user_id := old.auth_user_id;
    new.id := old.id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_doctor_critical_columns on public.doctors;
create trigger trg_protect_doctor_critical_columns
before update on public.doctors
for each row execute function public.protect_doctor_critical_columns();
