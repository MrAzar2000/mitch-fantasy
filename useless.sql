-- League-wide counter for the Useless Features "The Button". Run once in Supabase -> SQL Editor.
-- Visitors can read the total and add clicks only through useless_click(), capped at 200 per call;
-- nobody can set or reset the number from the site.
create table if not exists public.useless_counter (
  id      int primary key default 1 check (id = 1),
  clicks  bigint not null default 0
);
insert into public.useless_counter (id, clicks) values (1, 0) on conflict (id) do nothing;

alter table public.useless_counter enable row level security;
create policy "counter read" on public.useless_counter for select to anon using (true);

create or replace function public.useless_click(n int)
returns bigint
language sql
security definer
set search_path = public
as $$
  update public.useless_counter
     set clicks = clicks + greatest(0, least(n, 200))
   where id = 1
  returning clicks;
$$;
revoke all on function public.useless_click(int) from public;
grant execute on function public.useless_click(int) to anon;

-- live updates so everyone's total ticks up together
alter publication supabase_realtime add table public.useless_counter;
