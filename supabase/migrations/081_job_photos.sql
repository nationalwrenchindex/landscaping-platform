-- 081_job_photos.sql
-- Completion photos for landscaping jobs.
--
-- Photos are uploaded from the schedule job view, stored in the public
-- "job-photos" storage bucket, and automatically attached to any invoice
-- created from that job (and to the invoice email the customer receives).

create table if not exists public.job_photos (
  id           uuid primary key default gen_random_uuid(),
  job_id       uuid not null references public.jobs(id) on delete cascade,
  user_id      uuid not null references auth.users(id)  on delete cascade,
  storage_path text not null,
  public_url   text not null,
  caption      text,
  taken_at     timestamptz not null default now(),
  created_at   timestamptz not null default now()
);

create index if not exists idx_job_photos_job  on public.job_photos(job_id);
create index if not exists idx_job_photos_user on public.job_photos(user_id);

alter table public.job_photos enable row level security;

do $$ begin
  create policy "job_photos: all own" on public.job_photos
    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

-- ─────────────────────────────────────────────────────────────
-- Storage bucket: job-photos (public)
-- ─────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('job-photos', 'job-photos', true)
on conflict (id) do update set public = true;

-- Anyone can read (public bucket → customers see photos in their invoice email).
do $$ begin
  create policy "job-photos: public read" on storage.objects
    for select using (bucket_id = 'job-photos');
exception when duplicate_object then null; end $$;

-- Authenticated users can upload into the bucket.
do $$ begin
  create policy "job-photos: authenticated insert" on storage.objects
    for insert to authenticated
    with check (bucket_id = 'job-photos');
exception when duplicate_object then null; end $$;

-- Owners can update / delete their own objects.
do $$ begin
  create policy "job-photos: owner update" on storage.objects
    for update to authenticated
    using (bucket_id = 'job-photos' and owner = auth.uid());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "job-photos: owner delete" on storage.objects
    for delete to authenticated
    using (bucket_id = 'job-photos' and owner = auth.uid());
exception when duplicate_object then null; end $$;
