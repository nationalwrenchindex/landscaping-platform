-- The social_posts table was originally created out-of-band on the NWI project
-- (its CREATE migration is missing from this repo — gaps at 007/062/069).
-- Recreate it here from the columns the app reads/writes so a fresh project
-- (the landscaping platform) provisions cleanly. Idempotent + RLS-scoped.
create table if not exists public.social_posts (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  platform          text not null,
  content           text,
  visual_suggestion text,
  theme             text,
  status            text default 'pending',
  created_at        timestamptz not null default now(),
  posted_at         timestamptz
);

create index if not exists idx_social_posts_user on public.social_posts(user_id);

alter table public.social_posts enable row level security;

do $$ begin
  create policy "social_posts: all own" on public.social_posts
    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

-- Original 040 intent: image_prompt column for AI image generation prompts.
alter table public.social_posts add column if not exists image_prompt text;
