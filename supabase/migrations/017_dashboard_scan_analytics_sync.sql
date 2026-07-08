create or replace function public.sync_scan_analytics_events()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.analytics_events (doctor_id, scan_id, event_type, created_at)
  values (new.doctor_id, new.id, 'scan', coalesce(new.created_at, now()))
  on conflict (scan_id, event_type) do nothing;

  if new.review_copied = true then
    insert into public.analytics_events (doctor_id, scan_id, event_type, created_at)
    values (new.doctor_id, new.id, 'copy', now())
    on conflict (scan_id, event_type) do nothing;
  end if;

  if new.redirected_to_gmb = true then
    insert into public.analytics_events (doctor_id, scan_id, event_type, created_at)
    values (new.doctor_id, new.id, 'click_maps', now())
    on conflict (scan_id, event_type) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists sync_scan_analytics_after_insert on public.scans;
create trigger sync_scan_analytics_after_insert
after insert on public.scans
for each row execute function public.sync_scan_analytics_events();

drop trigger if exists sync_scan_analytics_after_update on public.scans;
create trigger sync_scan_analytics_after_update
after update of review_copied, redirected_to_gmb on public.scans
for each row
when (
  (new.review_copied = true and old.review_copied is distinct from true)
  or (new.redirected_to_gmb = true and old.redirected_to_gmb is distinct from true)
)
execute function public.sync_scan_analytics_events();

insert into public.analytics_events (doctor_id, scan_id, event_type, created_at)
select doctor_id, id, 'scan', created_at from public.scans
on conflict (scan_id, event_type) do nothing;

insert into public.analytics_events (doctor_id, scan_id, event_type, created_at)
select doctor_id, id, 'copy', created_at from public.scans where review_copied = true
on conflict (scan_id, event_type) do nothing;

insert into public.analytics_events (doctor_id, scan_id, event_type, created_at)
select doctor_id, id, 'click_maps', created_at from public.scans where redirected_to_gmb = true
on conflict (scan_id, event_type) do nothing;
