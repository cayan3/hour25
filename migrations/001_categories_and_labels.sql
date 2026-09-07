create extension if not exists "pgcrypto";

-- 001: categories and labels (before user_settings, which references labels)
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  color text not null,
  created_at timestamptz default now()
);
-- Case-insensitive uniqueness (C-32). No soft delete on categories in v1.
create unique index categories_user_name on public.categories(user_id, lower(name));

create table public.labels (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category_id uuid references public.categories(id) on delete set null,
  name text not null,
  color text not null,
  deleted_at timestamptz,
  created_at timestamptz default now()
);
-- Uniqueness applies to ACTIVE labels only, case-insensitively (C-32):
-- soft-deleting a label frees its name; the app offers restore-or-create on collision.
create unique index labels_user_active_name
  on public.labels(user_id, lower(name)) where deleted_at is null;

-- NOTE (C-31): there is no system label, no is_system column, no protection
-- trigger, and no getOrCreateUntrackedLabel(). An empty slot IS untracked time.
