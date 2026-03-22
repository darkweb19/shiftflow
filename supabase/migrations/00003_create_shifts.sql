create table public.shifts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  date date not null,
  start_time text not null,
  end_time text not null,
  role text,
  station text,
  notes text,
  source_pdf_id uuid references public.pdfs(id),
  created_at timestamptz default now(),
  unique(user_id, date, start_time, end_time)
);

create index idx_shifts_user_date on public.shifts(user_id, date);

alter table public.shifts enable row level security;

create policy "Users read own shifts"
  on public.shifts for select using (auth.uid() = user_id);
