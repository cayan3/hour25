-- 005: rolling 28-day sums RPC. Used by the Phase 2 stats work, which is not
-- built yet — nothing calls this today, so it is safe to skip until then.
-- SECURITY INVOKER so row-level security still applies to the caller.
-- Returns raw sums; the client divides by the number of weeks actually
-- covered, so a partial first week is not averaged as if it were full.
create or replace function rolling_28day_sum(p_date date)
returns table(label_id uuid, total_minutes numeric)
language sql
security invoker
as $$
  select label_id, sum(chunk_minutes)::numeric as total_minutes
  from public.time_entries
  where user_id = auth.uid()
    and date > p_date - interval '28 days'
    and date <= p_date
  group by label_id;
$$;
