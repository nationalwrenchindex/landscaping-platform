-- 079_recurring_invoices.sql
-- Recurring invoice templates. A daily cron
-- (/api/cron/recurring-invoices) materializes these into real invoices.

create table if not exists public.recurring_invoices (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  customer_id       uuid not null references public.customers(id) on delete cascade,
  property_id       uuid references public.properties(id) on delete set null,
  title             text not null,
  frequency         text not null check (frequency in
                      ('weekly', 'biweekly', 'monthly', 'quarterly', 'semiannual', 'annual')),
  day_of_week       integer check (day_of_week between 0 and 6),
  day_of_month      integer check (day_of_month between 1 and 31),
  start_date        date not null default current_date,
  end_date          date,
  next_invoice_date date not null,
  auto_send         boolean not null default false,
  line_items        jsonb not null default '[]',
  tax_percent       numeric(6,3) not null default 0,
  notes             text,
  active            boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists idx_recurring_invoices_user     on public.recurring_invoices(user_id);
create index if not exists idx_recurring_invoices_customer on public.recurring_invoices(customer_id);
create index if not exists idx_recurring_invoices_due      on public.recurring_invoices(next_invoice_date) where active;

drop trigger if exists set_recurring_invoices_updated_at on public.recurring_invoices;
create trigger set_recurring_invoices_updated_at
  before update on public.recurring_invoices
  for each row execute procedure public.set_updated_at();

alter table public.recurring_invoices enable row level security;

do $$ begin
  create policy "recurring_invoices: all own" on public.recurring_invoices
    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

-- Link generated invoices back to their template
alter table public.invoices
  add column if not exists recurring_invoice_id uuid references public.recurring_invoices(id) on delete set null;

create index if not exists idx_invoices_recurring on public.invoices(recurring_invoice_id);
