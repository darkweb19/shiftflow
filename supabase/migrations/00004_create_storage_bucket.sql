insert into storage.buckets (id, name, public)
values ('schedule-pdfs', 'schedule-pdfs', false);

create policy "Users read own schedule PDFs"
  on storage.objects for select
  using (
    bucket_id = 'schedule-pdfs'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Service role uploads schedule PDFs"
  on storage.objects for insert
  with check (bucket_id = 'schedule-pdfs');
