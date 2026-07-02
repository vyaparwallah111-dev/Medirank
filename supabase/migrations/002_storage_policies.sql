insert into storage.buckets (id,name,public) values ('qr-codes','qr-codes',true) on conflict (id) do update set public=true;
create policy "clinic owners upload own assets" on storage.objects for insert to authenticated with check (bucket_id='qr-codes' and (storage.foldername(name))[1]=auth.uid()::text);
create policy "clinic owners update own assets" on storage.objects for update to authenticated using (bucket_id='qr-codes' and (storage.foldername(name))[1]=auth.uid()::text) with check (bucket_id='qr-codes' and (storage.foldername(name))[1]=auth.uid()::text);
create policy "public clinic assets" on storage.objects for select to public using (bucket_id='qr-codes');
