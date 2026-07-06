create table if not exists public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid not null references public.doctors(id) on delete cascade,
  scan_id uuid references public.scans(id) on delete cascade,
  event_type text not null check (event_type in ('scan','copy','click_maps')),
  created_at timestamptz not null default now(),
  unique (scan_id, event_type)
);

alter table public.analytics_events enable row level security;
create index if not exists analytics_events_doctor_type_created_idx
  on public.analytics_events (doctor_id, event_type, created_at desc);

insert into public.analytics_events (doctor_id, scan_id, event_type, created_at)
select doctor_id, id, 'scan', created_at from public.scans
on conflict (scan_id, event_type) do nothing;

insert into public.analytics_events (doctor_id, scan_id, event_type, created_at)
select doctor_id, id, 'copy', created_at from public.scans where review_copied = true
on conflict (scan_id, event_type) do nothing;

insert into public.analytics_events (doctor_id, scan_id, event_type, created_at)
select doctor_id, id, 'click_maps', created_at from public.scans where redirected_to_gmb = true
on conflict (scan_id, event_type) do nothing;

drop policy if exists "owners and admins read analytics events" on public.analytics_events;
create policy "owners and admins read analytics events"
on public.analytics_events for select
using (
  public.is_admin() or exists (
    select 1 from public.doctors d
    where d.id = analytics_events.doctor_id
      and d.auth_user_id = auth.uid()
  )
);

revoke insert, update, delete on public.analytics_events from anon, authenticated;
