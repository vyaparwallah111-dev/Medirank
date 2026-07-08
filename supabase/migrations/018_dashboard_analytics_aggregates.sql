create or replace function public.get_dashboard_analytics_trends(
  target_doctor_id uuid,
  daily_days integer default 14,
  weekly_weeks integer default 8
)
returns table (
  period text,
  bucket_start timestamptz,
  scans bigint,
  posts bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with permitted as (
    select exists (
      select 1
      from public.doctors d
      where d.id = target_doctor_id
        and (d.auth_user_id = auth.uid() or public.is_admin())
    ) as allowed
  ),
  daily_buckets as (
    select generate_series(
      date_trunc('day', now()) - ((greatest(daily_days, 1) - 1) * interval '1 day'),
      date_trunc('day', now()),
      interval '1 day'
    ) as bucket_start
  ),
  weekly_buckets as (
    select generate_series(
      date_trunc('week', now()) - ((greatest(weekly_weeks, 1) - 1) * interval '1 week'),
      date_trunc('week', now()),
      interval '1 week'
    ) as bucket_start
  ),
  daily_events as (
    select
      date_trunc('day', ae.created_at) as bucket_start,
      count(*) filter (where ae.event_type = 'scan') as scans,
      count(*) filter (where ae.event_type = 'click_maps') as posts
    from public.analytics_events ae, permitted p
    where p.allowed
      and ae.doctor_id = target_doctor_id
      and ae.created_at >= date_trunc('day', now()) - ((greatest(daily_days, 1) - 1) * interval '1 day')
      and ae.event_type in ('scan', 'click_maps')
    group by 1
  ),
  weekly_events as (
    select
      date_trunc('week', ae.created_at) as bucket_start,
      count(*) filter (where ae.event_type = 'scan') as scans,
      count(*) filter (where ae.event_type = 'click_maps') as posts
    from public.analytics_events ae, permitted p
    where p.allowed
      and ae.doctor_id = target_doctor_id
      and ae.created_at >= date_trunc('week', now()) - ((greatest(weekly_weeks, 1) - 1) * interval '1 week')
      and ae.event_type in ('scan', 'click_maps')
    group by 1
  )
  select
    'daily'::text as period,
    db.bucket_start,
    coalesce(de.scans, 0)::bigint as scans,
    coalesce(de.posts, 0)::bigint as posts
  from daily_buckets db
  left join daily_events de using (bucket_start)
  union all
  select
    'weekly'::text as period,
    wb.bucket_start,
    coalesce(we.scans, 0)::bigint as scans,
    coalesce(we.posts, 0)::bigint as posts
  from weekly_buckets wb
  left join weekly_events we using (bucket_start)
  order by period, bucket_start;
$$;

revoke all on function public.get_dashboard_analytics_trends(uuid, integer, integer) from public;
grant execute on function public.get_dashboard_analytics_trends(uuid, integer, integer) to authenticated;
