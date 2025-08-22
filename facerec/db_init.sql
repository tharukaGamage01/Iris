-- Enable pgvector (Supabase: already available; else CREATE EXTENSION)
create extension if not exists vector;

create table if not exists people (
  id uuid primary key default gen_random_uuid(),
  external_id text unique,
  name text,
  created_at timestamptz default now()
);

-- We won't hardcode dimension (128 vs 512). We'll use a generic vector.
-- pgvector requires a fixed dimension per column. Choose the dimension you use.
-- If your FaceNet model is 128D, set vector(128); if 512D, set vector(512).

-- >>> SET THIS to your model dimension before running! <<<
-- Example below shows 71. Change to match your model's output dimension.
create table if not exists face_embeddings (
  id uuid primary key default gen_random_uuid(),
  person_id uuid references people(id) on delete cascade,
  embedding vector(71),            -- <-- changed to vector(71) to match model output
  quality_score real,
  created_at timestamptz default now()
);

-- ANN index for cosine distance (fast 1:N)
drop index if exists idx_face_embeddings_cos;
create index idx_face_embeddings_cos
on face_embeddings
using ivfflat (embedding vector_cosine_ops)
with (lists = 100);

analyze face_embeddings;

-- DROP EXISTING ATTENDANCE TABLES AND RECREATE WITH UPDATED SCHEMA
drop table if exists daily_attendance cascade;
drop table if exists attendance_records cascade;
drop table if exists attendance_sessions cascade;

-- Attendance tracking tables
create table attendance_sessions (
  id uuid primary key default gen_random_uuid(),
  session_name text not null,
  location text,
  start_time timestamptz not null,
  end_time timestamptz,
  is_active boolean default true,
  created_at timestamptz default now()
);

-- Enhanced attendance records with check-in/check-out support
create table attendance_records (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references attendance_sessions(id) on delete cascade,
  person_id uuid references people(id) on delete cascade,
  check_in_time timestamptz not null default now(),
  check_out_time timestamptz,
  duration_minutes integer,
  confidence_score real not null,
  photo_path text,
  notes text,
  status text default 'checked_in' check (status in ('checked_in', 'checked_out')),
  created_at timestamptz default now()
);

-- Daily attendance tracking table for check-in/check-out pairs
create table daily_attendance (
  id uuid primary key default gen_random_uuid(),
  person_id uuid references people(id) on delete cascade,
  session_id uuid references attendance_sessions(id) on delete cascade,
  date date not null default current_date,
  check_in_time timestamptz,
  check_out_time timestamptz,
  total_duration_minutes integer,
  check_in_confidence real,
  check_out_confidence real,
  status text default 'checked_in' check (status in ('checked_in', 'checked_out', 'incomplete')),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(person_id, session_id, date)
);

-- Indexes for attendance queries
create index idx_attendance_records_session_id on attendance_records(session_id);
create index idx_attendance_records_person_id on attendance_records(person_id);
create index idx_attendance_records_check_in_time on attendance_records(check_in_time);
create index idx_attendance_sessions_active on attendance_sessions(is_active) where is_active = true;
create index idx_attendance_records_status on attendance_records(status);

-- Indexes for daily attendance
create index idx_daily_attendance_person_date on daily_attendance(person_id, date);
create index idx_daily_attendance_session_date on daily_attendance(session_id, date);
create index idx_daily_attendance_status on daily_attendance(status);

-- Function to calculate duration
create or replace function update_attendance_duration()
returns trigger as $$
begin
  if NEW.check_out_time is not null and NEW.check_in_time is not null then
    NEW.total_duration_minutes = extract(epoch from (NEW.check_out_time - NEW.check_in_time)) / 60;
    NEW.status = 'checked_out';
  end if;
  NEW.updated_at = now();
  return NEW;
end;
$$ language plpgsql;

-- Trigger to auto-calculate duration
drop trigger if exists trigger_update_attendance_duration on daily_attendance;
create trigger trigger_update_attendance_duration
  before update on daily_attendance
  for each row execute function update_attendance_duration();