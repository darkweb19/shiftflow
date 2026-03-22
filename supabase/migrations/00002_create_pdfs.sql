create type pdf_status as enum ('pending', 'processing', 'completed', 'failed');

create table public.pdfs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  file_path text not null,
  file_name text not null,
  hash text not null,
  week_start date,
  week_end date,
  status pdf_status default 'pending',
  error_msg text,
  uploaded_at timestamptz default now(),
  unique(user_id, hash)
);

create index idx_pdfs_user on public.pdfs(user_id);

alter table public.pdfs enable row level security;

create policy "Users read own PDFs"
  on public.pdfs for select using (auth.uid() = user_id);
