-- 077_jobs.sql
-- Scheduling & route management for the landscaping vertical.
--
-- public.jobs already exists (migration 001) with job_date / job_time /
-- service_type and a NOT NULL constraint on job_date + service_type. This
-- migration adds the landscaping scheduling shape alongside it and syncs the
-- two representations with a trigger so existing NWI scheduler pages keep
-- reading job_date / service_type.

-- ─────────────────────────────────────────────────────────────
-- jobs: additive columns
-- ─────────────────────────────────────────────────────────────
alter table public.jobs add column if not exists property_id      uuid references public.properties(id) on delete set null;
alter table public.jobs add column if not exists title            text;
alter table public.jobs add column if not exists description      text;
alter table public.jobs add column if not exists scheduled_date   date;
alter table public.jobs add column if not exists scheduled_time   time;
alter table public.jobs add column if not exists duration_minutes integer;
alter table public.jobs add column if not exists crew_notes       text;
alter table public.jobs add column if not exists completion_notes text;
alter table public.jobs add column if not exists completed_at     timestamptz;

update public.jobs set scheduled_date = job_date     where scheduled_date is null;
update public.jobs set scheduled_time = job_time     where scheduled_time is null and job_time is not null;
update public.jobs set title          = service_type where title is null;
update public.jobs
   set duration_minutes = estimated_duration_minutes
 where duration_minutes is null and estimated_duration_minutes is not null;

-- Mirror the landscaping fields onto the legacy NOT NULL columns (and back),
-- so a row written from either UI satisfies both schemas.
create or replace function public.sync_lawn_job_fields()
returns trigger
language plpgsql
as $$
begin
  new.job_date       := coalesce(new.scheduled_date, new.job_date, current_date);
  new.scheduled_date := new.job_date;

  if new.scheduled_time is not null then
    new.job_time := new.scheduled_time;
  elsif new.job_time is not null then
    new.scheduled_time := new.job_time;
  end if;

  new.service_type := coalesce(nullif(trim(coalesce(new.title, '')), ''), new.service_type, 'Lawn Service');
  new.title        := coalesce(nullif(trim(coalesce(new.title, '')), ''), new.service_type);

  if new.duration_minutes is not null then
    new.estimated_duration_minutes := new.duration_minutes;
  elsif new.estimated_duration_minutes is not null then
    new.duration_minutes := new.estimated_duration_minutes;
  end if;

  -- Stamp completion time the first time a job flips to completed
  if new.status = 'completed' and new.completed_at is null then
    new.completed_at := now();
  end if;

  return new;
end;
$$;

drop trigger if exists sync_lawn_job_fields_trigger on public.jobs;
create trigger sync_lawn_job_fields_trigger
  before insert or update on public.jobs
  for each row execute procedure public.sync_lawn_job_fields();

create index if not exists idx_jobs_property        on public.jobs(property_id);
create index if not exists idx_jobs_scheduled_date  on public.jobs(scheduled_date);

-- ─────────────────────────────────────────────────────────────
-- job_services
-- ─────────────────────────────────────────────────────────────
create table if not exists public.job_services (
  id           uuid primary key default gen_random_uuid(),
  job_id       uuid not null references public.jobs(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  service_name text not null,
  quantity     numeric(10,2) not null default 1,
  unit_price   numeric(10,2) not null default 0,
  total        numeric(10,2) not null default 0,
  created_at   timestamptz not null default now()
);

create index if not exists idx_job_services_job  on public.job_services(job_id);
create index if not exists idx_job_services_user on public.job_services(user_id);

alter table public.job_services enable row level security;

do $$ begin
  create policy "job_services: all own" on public.job_services
    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;
