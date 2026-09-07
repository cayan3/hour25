-- 003: time_entries
create table public.time_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  label_id uuid not null references public.labels(id),    -- NOT NULL: a row means "logged as this label".
                                                          -- "Nothing logged" = no row (C-31). Note-only
                                                          -- entries do not exist; notes ride on labeled slots.
  date date not null,                                     -- local calendar date
  slot_index int not null check (slot_index >= 0 and slot_index <= 47),
  chunk_minutes int not null default 30,
  note text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id, date, slot_index)
);

create index time_entries_user_date on public.time_entries(user_id, date);

-- updated_at is server truth; the client never sends it, because client
-- clocks are not evidence.
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create trigger time_entries_updated_at
  before update on public.time_entries
  for each row execute function public.set_updated_at();
