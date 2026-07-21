-- 076_customers_and_properties.sql
-- Customer & property management for the landscaping vertical.
--
-- NOTE: public.customers already exists (migration 001) with first_name /
-- last_name / address_line1. Rather than fork a second customer table, this
-- migration extends the existing one with the landscaping-facing shape
-- (full_name, address) and installs a trigger that keeps both name
-- representations in sync so pre-existing NWI pages keep working.

-- ─────────────────────────────────────────────────────────────
-- customers: additive columns
-- ─────────────────────────────────────────────────────────────
alter table public.customers add column if not exists full_name text;
alter table public.customers add column if not exists address   text;

-- Existing rows carry first/last only — backfill the new columns.
update public.customers
   set full_name = nullif(trim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')), '')
 where full_name is null;

update public.customers
   set address = address_line1
 where address is null and address_line1 is not null;

-- first_name / last_name were NOT NULL; landscaping inserts supply full_name
-- only, so relax them and let the sync trigger populate the pair.
alter table public.customers alter column first_name drop not null;
alter table public.customers alter column last_name  drop not null;

-- Keep full_name <-> first_name/last_name and address <-> address_line1
-- consistent regardless of which side wrote the row.
create or replace function public.sync_customer_name()
returns trigger
language plpgsql
as $$
declare
  parts text[];
begin
  -- full_name supplied, name pair empty → split
  if new.full_name is not null and trim(new.full_name) <> ''
     and (new.first_name is null or trim(new.first_name) = '') then
    parts := regexp_split_to_array(trim(new.full_name), '\s+');
    new.first_name := parts[1];
    if array_length(parts, 1) > 1 then
      new.last_name := array_to_string(parts[2:array_length(parts, 1)], ' ');
    else
      new.last_name := '';
    end if;
  end if;

  -- name pair supplied, full_name empty → join
  if (new.full_name is null or trim(new.full_name) = '')
     and (new.first_name is not null or new.last_name is not null) then
    new.full_name := nullif(trim(coalesce(new.first_name, '') || ' ' || coalesce(new.last_name, '')), '');
  end if;

  -- Never leave the legacy NOT-NULL-ish columns as NULL
  new.first_name := coalesce(new.first_name, '');
  new.last_name  := coalesce(new.last_name,  '');

  -- Address mirror
  if new.address is not null and new.address_line1 is null then
    new.address_line1 := new.address;
  elsif new.address is null and new.address_line1 is not null then
    new.address := new.address_line1;
  end if;

  return new;
end;
$$;

drop trigger if exists sync_customer_name_trigger on public.customers;
create trigger sync_customer_name_trigger
  before insert or update on public.customers
  for each row execute procedure public.sync_customer_name();

-- ─────────────────────────────────────────────────────────────
-- properties
-- ─────────────────────────────────────────────────────────────
create table if not exists public.properties (
  id               uuid primary key default gen_random_uuid(),
  customer_id      uuid not null references public.customers(id) on delete cascade,
  user_id          uuid not null references auth.users(id) on delete cascade,
  name             text,
  address          text,
  city             text,
  state            text,
  zip              text,
  square_footage   integer,
  lot_size_acres   numeric(8,3),
  gate_code        text,
  dog_on_property  boolean not null default false,
  property_notes   text,
  lat              numeric(10,6),
  lng              numeric(10,6),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists idx_properties_user     on public.properties(user_id);
create index if not exists idx_properties_customer on public.properties(customer_id);

drop trigger if exists set_properties_updated_at on public.properties;
create trigger set_properties_updated_at
  before update on public.properties
  for each row execute procedure public.set_updated_at();

alter table public.properties enable row level security;

do $$ begin
  create policy "properties: all own" on public.properties
    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;
