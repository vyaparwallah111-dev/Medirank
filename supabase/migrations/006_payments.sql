create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid not null references public.doctors(id) on delete cascade,
  razorpay_order_id text unique,
  razorpay_payment_id text unique,
  plan text not null check (plan in ('growth', 'premium')),
  amount integer not null check (amount > 0),
  status text not null default 'pending' check (status in ('pending', 'success', 'failed')),
  created_at timestamptz not null default now()
);

alter table public.payments enable row level security;

create policy "Doctors view own payments"
on public.payments for select
using (doctor_id in (select id from public.doctors where auth_user_id = auth.uid()));

create policy "Doctors create own pending payments"
on public.payments for insert
with check (
  status = 'pending'
  and doctor_id in (select id from public.doctors where auth_user_id = auth.uid())
);
