alter table public.doctors add column if not exists is_admin boolean not null default false;
alter table public.doctors add column if not exists total_scans_used bigint not null default 0;

-- Preserve historical usage when this counter is introduced.
update public.doctors d
set total_scans_used = counts.total
from (select doctor_id, count(*)::bigint as total from public.scans group by doctor_id) counts
where d.id = counts.doctor_id and d.total_scans_used = 0;

create or replace function public.increment_doctor_scan_count()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.doctors set total_scans_used = total_scans_used + 1 where id = new.doctor_id;
  return new;
end;
$$;

drop trigger if exists increment_doctor_scan_count_after_insert on public.scans;
create trigger increment_doctor_scan_count_after_insert
after insert on public.scans for each row execute function public.increment_doctor_scan_count();

-- is_admin on the doctor profile is the single source of truth for admin RLS.
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.doctors where auth_user_id = auth.uid() and is_admin = true)
$$;
