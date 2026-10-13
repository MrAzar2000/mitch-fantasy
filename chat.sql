-- Anonymous league chat. Run once in Supabase → SQL Editor.
-- Visitors can read and post (no login); nobody can edit or delete from the site.
-- Remove messages from Supabase → Table Editor → chat_messages.
create table if not exists public.chat_messages (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  alias       text not null check (char_length(alias) between 1 and 40),
  color       text not null check (color ~ '^#[0-9a-fA-F]{6}$'),
  body        text not null check (char_length(body) between 1 and 400),
  client_key  text check (char_length(client_key) <= 20)
);

alter table public.chat_messages enable row level security;

create policy "chat read" on public.chat_messages for select to anon using (true);
create policy "chat post" on public.chat_messages for insert to anon with check (true);

-- live updates so new messages appear without refreshing
alter publication supabase_realtime add table public.chat_messages;
