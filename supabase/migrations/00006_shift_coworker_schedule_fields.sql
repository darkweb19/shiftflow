-- Coworker rows: store their shift window + station/role for the same calendar day (from PDF).
alter table public.shift_coworkers
  add column if not exists start_time text,
  add column if not exists end_time text,
  add column if not exists station text,
  add column if not exists role text;

comment on column public.shift_coworkers.start_time is 'Coworker shift start (24h HH:MM), workplace local';
comment on column public.shift_coworkers.end_time is 'Coworker shift end (24h HH:MM), workplace local';
