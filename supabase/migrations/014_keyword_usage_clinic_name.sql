alter table public.keyword_usage_log
  drop constraint if exists keyword_usage_log_usage_type_check;

alter table public.keyword_usage_log
  add constraint keyword_usage_log_usage_type_check
  check (usage_type in ('doctor_name','clinic_name','area_name','treatment','superlative'));
