alter table public.doctors
add column if not exists theme_config jsonb not null
default '{"primary":"#1E40AF","accent":"#F97316","background":"#F8FAFC"}'::jsonb;

alter table public.doctors
add constraint doctors_theme_config_is_object
check (jsonb_typeof(theme_config) = 'object') not valid;

with dentist_keywords(keyword,category) as (values
  ('Painless root canal','treatment'),
  ('Best dental implant','treatment'),
  ('Teeth whitening','treatment'),
  ('Painless tooth extraction','treatment'),
  ('Advanced clinic treatment','treatment'),
  ('Friendly and caring doctor','behaviour'),
  ('Explained treatment clearly','behaviour'),
  ('Clean and hygienic clinic','cleanliness')
)
insert into public.doctor_keywords (doctor_id,keyword,category)
select d.id,k.keyword,k.category
from public.doctors d cross join dentist_keywords k
where lower(coalesce(d.specialization,'')) like '%dent%'
and not exists (
  select 1 from public.doctor_keywords existing
  where existing.doctor_id=d.id and lower(existing.keyword)=lower(k.keyword)
);
