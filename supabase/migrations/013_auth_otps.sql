create table if not exists public.auth_otps (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  otp_code varchar(6) not null,
  expires_at timestamptz not null,
  is_verified boolean not null default false,
  attempts smallint not null default 0 check (attempts between 0 and 5),
  created_at timestamptz not null default now()
);

create index if not exists auth_otps_email_created_idx on public.auth_otps (email, created_at desc);
alter table public.auth_otps enable row level security;

-- No client policies: this table is intentionally accessible only through service-role API routes.
revoke all on table public.auth_otps from anon, authenticated;
