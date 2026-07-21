-- 078_invoices.sql
-- Invoicing for the landscaping vertical.
--
-- public.invoices already exists (migration 001) with a jsonb line_items
-- column and a text invoice_number unique per user. This migration adds the
-- landscaping fields (property_id, tax_percent, sent_at), a normalized
-- invoice_line_items table, and a per-user auto-incrementing invoice number
-- starting at 1001.

-- ─────────────────────────────────────────────────────────────
-- invoices: additive columns
-- ─────────────────────────────────────────────────────────────
alter table public.invoices add column if not exists property_id uuid references public.properties(id) on delete set null;
alter table public.invoices add column if not exists tax_percent numeric(6,3) default 0;
alter table public.invoices add column if not exists sent_at     timestamptz;
alter table public.invoices add column if not exists invoice_seq integer;

-- tax_rate (migration 001) is a fraction, tax_percent is 0-100. Backfill.
update public.invoices
   set tax_percent = round(coalesce(tax_rate, 0) * 100, 3)
 where tax_percent is null or tax_percent = 0;

create index if not exists idx_invoices_property on public.invoices(property_id);

-- Per-user sequence: the first landscaping invoice for a user is 1001.
create or replace function public.assign_invoice_number()
returns trigger
language plpgsql
as $$
declare
  next_seq integer;
begin
  if new.invoice_seq is null then
    select coalesce(max(invoice_seq), 1000) + 1
      into next_seq
      from public.invoices
     where user_id = new.user_id;
    new.invoice_seq := next_seq;
  end if;

  if new.invoice_number is null or trim(new.invoice_number) = '' then
    new.invoice_number := new.invoice_seq::text;
  end if;

  -- Keep tax_rate (fraction) in step with tax_percent (0-100)
  if new.tax_percent is not null then
    new.tax_rate := round(new.tax_percent / 100.0, 4);
  end if;

  return new;
end;
$$;

drop trigger if exists assign_invoice_number_trigger on public.invoices;
create trigger assign_invoice_number_trigger
  before insert on public.invoices
  for each row execute procedure public.assign_invoice_number();

-- ─────────────────────────────────────────────────────────────
-- invoice_line_items
-- ─────────────────────────────────────────────────────────────
create table if not exists public.invoice_line_items (
  id          uuid primary key default gen_random_uuid(),
  invoice_id  uuid not null references public.invoices(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  description text not null,
  quantity    numeric(10,2) not null default 1,
  unit_price  numeric(10,2) not null default 0,
  total       numeric(10,2) not null default 0,
  position    integer not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists idx_invoice_line_items_invoice on public.invoice_line_items(invoice_id);
create index if not exists idx_invoice_line_items_user    on public.invoice_line_items(user_id);

alter table public.invoice_line_items enable row level security;

do $$ begin
  create policy "invoice_line_items: all own" on public.invoice_line_items
    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;
