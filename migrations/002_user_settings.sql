-- 002: user_settings
create table public.user_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique not null references auth.users(id) on delete cascade,
  timezone text not null default 'UTC',                   -- overwritten with the browser-detected
                                                          -- zone at first login (C-48); unused in v1
  sleep_start int not null default 46,                    -- slot index; 23:00
  sleep_end int not null default 14,                      -- slot index; 07:00
  sleep_label_id uuid references public.labels(id) on delete set null,
  chunk_minutes int not null default 30,                  -- constant in v1; no UI
  target_minutes_day int,                                 -- Phase 3
  dashboard_config jsonb,                                 -- versioned; see §9
  theme text not null default 'system',
  onboarded_at timestamptz,                               -- null = show onboarding (C-38)
  created_at timestamptz default now()
);
