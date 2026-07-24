-- 080_chemical_log.sql
-- Chemical & fertilizer application log for the landscaping vertical.
--
-- Landscapers who apply pesticides, herbicides and fertilizers are required in
-- most states to keep an application record (product, EPA reg #, rate, weather,
-- re-entry interval). This table backs the /chemical-log page and its CSV
-- compliance export. Every row is scoped to the owning user via RLS.

create table if not exists public.chemical_logs (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references auth.users(id) on delete cascade,
  job_id                 uuid references public.jobs(id)      on delete set null,
  property_id            uuid references public.properties(id) on delete set null,
  customer_id            uuid references public.customers(id)  on delete set null,
  product_name           text not null,
  manufacturer           text,
  epa_registration_number text,
  application_date       date not null,
  application_time       time,
  target_area            text,
  area_treated_sqft      integer,
  rate_per_1000sqft      numeric(12,3),
  total_amount_applied   numeric(12,3),
  unit                   text,            -- oz / lb / gal / qt
  application_method     text,            -- spray / granular / liquid / other
  wind_speed_mph         numeric(6,2),
  temperature_f          numeric(6,2),
  reentry_interval_hours numeric(6,2),
  is_organic             boolean not null default false,
  notes                  text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index if not exists idx_chemical_logs_user     on public.chemical_logs(user_id);
create index if not exists idx_chemical_logs_property on public.chemical_logs(property_id);
create index if not exists idx_chemical_logs_customer on public.chemical_logs(customer_id);
create index if not exists idx_chemical_logs_job      on public.chemical_logs(job_id);
create index if not exists idx_chemical_logs_date     on public.chemical_logs(application_date);

drop trigger if exists set_chemical_logs_updated_at on public.chemical_logs;
create trigger set_chemical_logs_updated_at
  before update on public.chemical_logs
  for each row execute procedure public.set_updated_at();

alter table public.chemical_logs enable row level security;

do $$ begin
  create policy "chemical_logs: all own" on public.chemical_logs
    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;
