-- How the PDF was ingested (Gmail webhook, Settings upload, or /sync/trigger).
alter table public.pdfs
  add column if not exists import_source text not null default 'gmail';

alter table public.pdfs drop constraint if exists pdfs_import_source_check;

alter table public.pdfs
  add constraint pdfs_import_source_check
  check (import_source in ('gmail', 'manual', 'sync'));

comment on column public.pdfs.import_source is 'gmail = Pub/Sub email; manual = Settings upload; sync = POST /sync/trigger';
