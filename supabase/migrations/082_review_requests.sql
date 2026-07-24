-- 082_review_requests.sql
-- Automated Google review requests — the landscaping equivalent of NWI's
-- TorqueWrench. When an invoice is marked paid, the platform texts the customer
-- a thank-you with the business's Google review link. Every send is logged here
-- so a paid invoice never texts the same customer twice.

-- Google review URL lives on the profile (add if a prior module hasn't already).
alter table public.profiles add column if not exists google_review_url text;

create table if not exists public.review_requests (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id)     on delete cascade,
  customer_id       uuid references public.customers(id)        on delete set null,
  job_id            uuid references public.jobs(id)             on delete set null,
  invoice_id        uuid references public.invoices(id)         on delete set null,
  phone_number      text,
  status            text not null default 'pending'
                      check (status in ('pending', 'sent', 'clicked', 'reviewed')),
  sent_at           timestamptz,
  clicked_at        timestamptz,
  google_review_url text,
  created_at        timestamptz not null default now()
);

create index if not exists idx_review_requests_user     on public.review_requests(user_id);
create index if not exists idx_review_requests_invoice  on public.review_requests(invoice_id);
create index if not exists idx_review_requests_customer on public.review_requests(customer_id);

-- One request per invoice — the app also guards this, but enforce it in the DB.
create unique index if not exists uq_review_requests_invoice
  on public.review_requests(invoice_id)
  where invoice_id is not null;

alter table public.review_requests enable row level security;

do $$ begin
  create policy "review_requests: all own" on public.review_requests
    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;
