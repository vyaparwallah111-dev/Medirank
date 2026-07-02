alter table public.doctors
add column if not exists knowledge_base jsonb not null
default '{"area_name":"","city_name":"","top_services":[]}'::jsonb;

alter table public.doctors
add constraint doctors_knowledge_base_is_object
check (jsonb_typeof(knowledge_base) = 'object') not valid;

update public.doctors
set knowledge_base = jsonb_build_object(
  'area_name', coalesce(knowledge_base->>'area_name',''),
  'city_name', coalesce(nullif(knowledge_base->>'city_name',''),city,''),
  'top_services', coalesce(knowledge_base->'top_services','[]'::jsonb)
);
