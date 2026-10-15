-- "League updates" banner on the Home page. Run once in Supabase -> SQL Editor.
-- To post an update: Supabase -> Table Editor -> league_updates -> Insert row -> type the message.
-- The newest 3 rows with active = true show on Home. Untick "active" (or delete the row) to hide one.
-- No website deploy is needed to post, edit or remove updates.
create table if not exists public.league_updates (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  message     text not null check (char_length(message) between 1 and 300),
  active      boolean not null default true
);

alter table public.league_updates enable row level security;
create policy "updates read" on public.league_updates for select to anon using (true);
