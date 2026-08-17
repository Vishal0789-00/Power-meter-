
-- Power Meter Reader v5: readings only, day-wise.
create extension if not exists pgcrypto;

create table if not exists public.meter_readings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  reading_date date not null,
  floor_name text not null,
  side text not null check (side in ('West','East')),
  meter_type text not null check (meter_type in ('Main','Raw','Lighting','HVAC')),
  position integer not null check (position between 1 and 8),
  kwh text,
  kvah text,
  status text not null default 'REVIEW' check (status in ('OK','REVIEW')),
  created_at timestamptz not null default now(),
  unique (user_id, reading_date, floor_name, position)
);

create index if not exists meter_readings_day_idx
  on public.meter_readings(user_id, reading_date desc, floor_name, position);

alter table public.meter_readings enable row level security;

drop policy if exists "Users can read their own readings" on public.meter_readings;
create policy "Users can read their own readings"
on public.meter_readings for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can insert their own readings" on public.meter_readings;
create policy "Users can insert their own readings"
on public.meter_readings for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can update their own readings" on public.meter_readings;
create policy "Users can update their own readings"
on public.meter_readings for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- No image bucket is created in v5.
-- Uploaded images exist only in the browser/request while extraction is running.
