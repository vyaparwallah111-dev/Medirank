-- Migration 031: Multi-vertical support for Coaching Institutes & Education alongside Doctors

-- 1. Add business_type and business_category to doctors table
alter table public.doctors add column if not exists business_type text not null default 'doctor';
alter table public.doctors add column if not exists business_category text;

-- 2. Ensure constraint allows 'doctor' and 'coaching'
do $$
begin
  alter table public.doctors drop constraint if exists doctors_business_type_check;
  alter table public.doctors add constraint doctors_business_type_check 
    check (business_type in ('doctor', 'coaching'));
exception
  when others then null;
end $$;

-- 3. Update existing records to 'doctor' if null
update public.doctors set business_type = 'doctor' where business_type is null;
