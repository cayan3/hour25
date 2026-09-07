-- 004: RLS
alter table public.user_settings enable row level security;
alter table public.categories enable row level security;
alter table public.labels enable row level security;
alter table public.time_entries enable row level security;

create policy "own" on public.user_settings for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own" on public.categories for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own" on public.labels for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own" on public.time_entries for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- RLS policies alone are not sufficient: Postgres also requires a base table
-- GRANT to the `authenticated` role independent of row-level security, and
-- these migrations don't run through Supabase Studio's table editor (which
-- would have applied this automatically). Without it, every query 403s with
-- 42501 "permission denied for table ..." even though the policy is correct.
grant select, insert, update on public.user_settings to authenticated;
grant select, insert, update, delete on public.categories to authenticated;
grant select, insert, update on public.labels to authenticated;
grant select, insert, update, delete on public.time_entries to authenticated;
