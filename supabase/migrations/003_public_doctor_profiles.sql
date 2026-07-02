drop policy if exists "owner or admin doctors select" on public.doctors;
create policy "owner or admin doctors select" on public.doctors for select using (auth_user_id=auth.uid() or public.is_admin());

create or replace view public.public_doctor_profiles
with (security_invoker=false)
as select id,doctor_name,clinic_name,specialization,slug,gmb_review_link,logo_url
from public.doctors where is_active=true;

revoke all on public.public_doctor_profiles from public;
grant select on public.public_doctor_profiles to anon,authenticated;

create or replace function public.is_active_doctor(target_doctor_id uuid)
returns boolean language sql stable security definer set search_path=public
as $$select exists(select 1 from doctors where id=target_doctor_id and is_active=true)$$;
revoke all on function public.is_active_doctor(uuid) from public;
grant execute on function public.is_active_doctor(uuid) to anon,authenticated;

drop policy if exists "tenant keywords read" on public.doctor_keywords;
create policy "owner or public active keywords read" on public.doctor_keywords for select
using (public.is_active_doctor(doctor_id) or exists(select 1 from public.doctors d where d.id=doctor_id and d.auth_user_id=auth.uid()) or public.is_admin());

drop policy if exists "public scan insert" on public.scans;
create policy "public active doctor scan insert" on public.scans for insert
with check (public.is_active_doctor(doctor_id));
