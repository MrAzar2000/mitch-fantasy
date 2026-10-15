-- Trade Block marketplace. Run once in Supabase -> SQL Editor.
-- One listing per team (team_id is the key). Visitors can post, update and clear their
-- listing from the site with no login -- the same open trust model as chat and parlay.
-- You can also remove a listing from Supabase -> Table Editor -> trade_block.
create table if not exists public.trade_block (
  team_id     int primary key,
  listing     jsonb not null default '{}'::jsonb,   -- {available:[pid,...], needs:["RB",...], note:"..."}
  updated_at  timestamptz not null default now()
);

alter table public.trade_block enable row level security;
create policy "block read"   on public.trade_block for select to anon using (true);
create policy "block insert" on public.trade_block for insert to anon with check (true);
create policy "block update" on public.trade_block for update to anon using (true) with check (true);
create policy "block delete" on public.trade_block for delete to anon using (true);

-- live updates so listings appear and change without a page refresh
alter publication supabase_realtime add table public.trade_block;
