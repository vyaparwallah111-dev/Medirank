alter table public.doctors
add column if not exists subscription_tier text;

update public.doctors
set subscription_tier = case
  when plan in ('growth', 'premium', 'starter') then plan
  else 'starter'
end
where subscription_tier is null;

update public.doctors
set subscription_tier = case
  when subscription_tier in ('growth', 'premium') then subscription_tier
  else 'starter'
end
where subscription_tier not in ('starter', 'growth', 'premium');

alter table public.doctors
alter column subscription_tier set default 'starter';

alter table public.doctors
alter column subscription_tier set not null;

alter table public.doctors
drop constraint if exists doctors_subscription_tier_check;

alter table public.doctors
add constraint doctors_subscription_tier_check
check (subscription_tier in ('starter', 'growth', 'premium'));
