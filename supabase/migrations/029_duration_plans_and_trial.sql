-- Migration 029: Allow duration-based plans and 3-day trial
-- Safely updates payments plan check constraint without affecting existing records

-- 1. Ensure plan date columns exist in doctors table
alter table public.doctors add column if not exists plan_started_at timestamptz;
alter table public.doctors add column if not exists plan_expires_at timestamptz;

-- 2. Update payments table check constraint to support 1-month, 3-month, 6-month, 1-year
alter table public.payments drop constraint if exists payments_plan_check;
alter table public.payments add constraint payments_plan_check 
  check (plan in ('1-month', '3-month', '6-month', '1-year', 'growth', 'premium', 'trial'));
