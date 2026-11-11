-- Our Notebook: Supabase setup
-- Paste this whole file into Supabase -> SQL Editor -> New query, and press Run.
-- 1) FIRST change the two emails just below to yours and hers.

-- ---------- who is allowed in ----------
create table if not exists public.members (
  email text primary key
);

insert into public.members (email) values
  ('you@example.com'),      -- <- your email
  ('her@example.com')       -- <- her email
on conflict do nothing;

alter table public.members enable row level security;
-- (no policies: nobody can read or edit this list from the website)

create or replace function public.is_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.members
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

revoke all on function public.is_member() from public, anon;
grant execute on function public.is_member() to authenticated;

-- ---------- the notebook itself ----------
create table if not exists public.elements (
  board text not null default 'main',
  id text not null,
  data jsonb not null,
  version integer not null,
  updated_at timestamptz not null default now(),
  primary key (board, id)
);

alter table public.elements enable row level security;

drop policy if exists "members read" on public.elements;
drop policy if exists "members write" on public.elements;
drop policy if exists "members update" on public.elements;

create policy "members read" on public.elements
  for select to authenticated using (public.is_member());
create policy "members write" on public.elements
  for insert to authenticated with check (public.is_member());
create policy "members update" on public.elements
  for update to authenticated using (public.is_member()) with check (public.is_member());

-- ---------- photo / video / GIF storage (private bucket, 50 MB per file) ----------
insert into storage.buckets (id, name, public, file_size_limit)
values ('media', 'media', false, 52428800)
on conflict (id) do update set public = false, file_size_limit = 52428800;

drop policy if exists "members read media" on storage.objects;
drop policy if exists "members add media" on storage.objects;
drop policy if exists "members update media" on storage.objects;

create policy "members read media" on storage.objects
  for select to authenticated using (bucket_id = 'media' and public.is_member());
create policy "members add media" on storage.objects
  for insert to authenticated with check (bucket_id = 'media' and public.is_member());
create policy "members update media" on storage.objects
  for update to authenticated using (bucket_id = 'media' and public.is_member());

-- ---------- live channel (edits + cursors) ----------
drop policy if exists "members listen" on realtime.messages;
drop policy if exists "members send" on realtime.messages;

create policy "members listen" on realtime.messages
  for select to authenticated using (public.is_member());
create policy "members send" on realtime.messages
  for insert to authenticated with check (public.is_member());
