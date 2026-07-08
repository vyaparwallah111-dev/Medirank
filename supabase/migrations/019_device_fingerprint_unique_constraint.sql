do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'device_fingerprints_doctor_id_fingerprint_hash_key'
      and conrelid = 'public.device_fingerprints'::regclass
  ) and not exists (
    select 1
    from public.device_fingerprints
    group by doctor_id, fingerprint_hash
    having count(*) > 1
  ) then
    alter table public.device_fingerprints
      add constraint device_fingerprints_doctor_id_fingerprint_hash_key
      unique (doctor_id, fingerprint_hash);
  end if;
end $$;
