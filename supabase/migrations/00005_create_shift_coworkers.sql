create table public.shift_coworkers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  shift_id uuid not null references public.shifts(id) on delete cascade,
  coworker_name text not null,
  created_at timestamptz default now(),
  unique(shift_id, coworker_name)
);

create index idx_shift_coworkers_user_shift on public.shift_coworkers(user_id, shift_id);

alter table public.shift_coworkers enable row level security;

create policy "Users read own shift coworkers"
  on public.shift_coworkers for select using (auth.uid() = user_id);
