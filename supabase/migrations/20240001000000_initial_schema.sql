-- ============================================================
-- Kamper: Initial Schema
-- ============================================================
-- All tables include:
--   - UUID primary keys
--   - camp_id for multi-tenancy (with RLS enforcement)
--   - created_at / updated_at timestamps
-- ============================================================

-- Enable required extensions
create extension if not exists "uuid-ossp";
create extension if not exists "pg_trgm";  -- fuzzy search for names

-- ─── Utility: auto-update updated_at ─────────────────────────────────────────

create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ─── Camps ────────────────────────────────────────────────────────────────────

create table public.camps (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null,
  slug        text not null unique,
  logo_url    text,
  timezone    text not null default 'America/New_York',
  status      text not null default 'active'
                check (status in ('active', 'inactive', 'archived')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger camps_updated_at
  before update on public.camps
  for each row execute function update_updated_at();

-- ─── Users (extends auth.users) ──────────────────────────────────────────────

create table public.users (
  id           uuid primary key references auth.users(id) on delete cascade,
  email        text not null unique,
  first_name   text not null,
  last_name    text not null,
  preferred_name text,
  avatar_url   text,
  phone        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create trigger users_updated_at
  before update on public.users
  for each row execute function update_updated_at();

-- Auto-create user profile on signup
create or replace function handle_new_auth_user()
returns trigger as $$
begin
  insert into public.users (id, email, first_name, last_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'first_name', ''),
    coalesce(new.raw_user_meta_data->>'last_name', '')
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_auth_user();

-- ─── Staff Roles ──────────────────────────────────────────────────────────────
-- A user can have different roles at different camps

create table public.staff_camp_roles (
  id         uuid primary key default uuid_generate_v4(),
  user_id    uuid not null references public.users(id) on delete cascade,
  camp_id    uuid not null references public.camps(id) on delete cascade,
  role       text not null
               check (role in ('super_admin', 'admin', 'staff_admin', 'staff', 'health')),
  created_at timestamptz not null default now(),
  unique (user_id, camp_id)
);

create index idx_staff_camp_roles_camp on public.staff_camp_roles(camp_id);
create index idx_staff_camp_roles_user on public.staff_camp_roles(user_id);

-- ─── Programs ────────────────────────────────────────────────────────────────

create table public.programs (
  id          uuid primary key default uuid_generate_v4(),
  camp_id     uuid not null references public.camps(id) on delete cascade,
  name        text not null,        -- e.g. "5th & 6th Grade Camp"
  description text,
  start_date  date not null,
  end_date    date not null,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (end_date >= start_date)
);

create trigger programs_updated_at
  before update on public.programs
  for each row execute function update_updated_at();

create index idx_programs_camp on public.programs(camp_id);

-- ─── Households ──────────────────────────────────────────────────────────────

create table public.households (
  id         uuid primary key default uuid_generate_v4(),
  camp_id    uuid not null references public.camps(id) on delete cascade,
  name       text not null,         -- e.g. "Smith Family"
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger households_updated_at
  before update on public.households
  for each row execute function update_updated_at();

create index idx_households_camp on public.households(camp_id);

-- ─── Household Members (parents/guardians) ───────────────────────────────────

create table public.household_members (
  id             uuid primary key default uuid_generate_v4(),
  household_id   uuid not null references public.households(id) on delete cascade,
  user_id        uuid not null references public.users(id) on delete cascade,
  is_primary     boolean not null default false,
  -- Permission flags (set by admins, invisible to parents)
  can_view_media       boolean not null default true,
  can_view_health_logs boolean not null default true,
  can_view_check_in_out boolean not null default true,
  can_message          boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (household_id, user_id)
);

create trigger household_members_updated_at
  before update on public.household_members
  for each row execute function update_updated_at();

create index idx_household_members_user on public.household_members(user_id);
create index idx_household_members_household on public.household_members(household_id);

-- ─── Campers ─────────────────────────────────────────────────────────────────

create table public.campers (
  id             uuid primary key default uuid_generate_v4(),
  camp_id        uuid not null references public.camps(id) on delete cascade,
  household_id   uuid not null references public.households(id) on delete cascade,
  first_name     text not null,
  last_name      text not null,
  preferred_name text,
  date_of_birth  date not null,
  photo_url      text,
  notes          text,              -- internal staff notes
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create trigger campers_updated_at
  before update on public.campers
  for each row execute function update_updated_at();

create index idx_campers_camp on public.campers(camp_id);
create index idx_campers_household on public.campers(household_id);

-- ─── Enrollments (camper ↔ program roster) ───────────────────────────────────

create table public.enrollments (
  id          uuid primary key default uuid_generate_v4(),
  camper_id   uuid not null references public.campers(id) on delete cascade,
  program_id  uuid not null references public.programs(id) on delete cascade,
  enrolled_at timestamptz not null default now(),
  unique (camper_id, program_id)
);

create index idx_enrollments_program on public.enrollments(program_id);
create index idx_enrollments_camper on public.enrollments(camper_id);

-- ─── Check-in / Check-out ────────────────────────────────────────────────────

create table public.check_events (
  id                       uuid primary key default uuid_generate_v4(),
  camper_id                uuid not null references public.campers(id),
  program_id               uuid not null references public.programs(id),
  type                     text not null check (type in ('check_in', 'check_out')),
  authorized_by_user_id    uuid not null references public.users(id),
  auth_method              text not null check (auth_method in ('passcode', 'signature')),
  signature_url            text,
  pickup_person_name       text,
  pickup_person_id_verified boolean not null default false,
  performed_by_staff_id    uuid references public.users(id),
  timestamp                timestamptz not null default now()
);

create index idx_check_events_camper on public.check_events(camper_id);
create index idx_check_events_program on public.check_events(program_id);
create index idx_check_events_timestamp on public.check_events(timestamp desc);

-- ─── Activities ───────────────────────────────────────────────────────────────

create table public.activities (
  id                  uuid primary key default uuid_generate_v4(),
  camp_id             uuid not null references public.camps(id) on delete cascade,
  program_id          uuid not null references public.programs(id) on delete cascade,
  posted_by_user_id   uuid not null references public.users(id),
  type                text not null
                        check (type in ('daily_log', 'photo', 'video', 'announcement')),
  daily_activity_type text
                        check (daily_activity_type in (
                          'swimming','canteen','bible_time','took_meds',
                          'quiet_time','rest_time','breakfast','lunch',
                          'dinner','snack','custom'
                        )),
  custom_label        text,    -- used when daily_activity_type = 'custom'
  caption             text,
  visibility          text not null default 'global'
                        check (visibility in ('global', 'tagged')),
  occurred_at         timestamptz not null default now(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create trigger activities_updated_at
  before update on public.activities
  for each row execute function update_updated_at();

create index idx_activities_camp on public.activities(camp_id);
create index idx_activities_program on public.activities(program_id);
create index idx_activities_occurred_at on public.activities(occurred_at desc);

-- ─── Activity Media ───────────────────────────────────────────────────────────

create table public.activity_media (
  id               uuid primary key default uuid_generate_v4(),
  activity_id      uuid not null references public.activities(id) on delete cascade,
  media_type       text not null check (media_type in ('photo', 'video')),
  url              text not null,
  thumbnail_url    text,
  width            int,
  height           int,
  duration_seconds int,          -- for video
  created_at       timestamptz not null default now()
);

create index idx_activity_media_activity on public.activity_media(activity_id);

-- ─── Activity Camper Tags ─────────────────────────────────────────────────────

create table public.activity_camper_tags (
  id               uuid primary key default uuid_generate_v4(),
  activity_id      uuid not null references public.activities(id) on delete cascade,
  camper_id        uuid not null references public.campers(id) on delete cascade,
  tagged_by_user_id uuid not null references public.users(id),
  created_at       timestamptz not null default now(),
  unique (activity_id, camper_id)
);

create index idx_activity_tags_activity on public.activity_camper_tags(activity_id);
create index idx_activity_tags_camper on public.activity_camper_tags(camper_id);

-- ─── Health Logs ─────────────────────────────────────────────────────────────

create table public.health_logs (
  id                uuid primary key default uuid_generate_v4(),
  camper_id         uuid not null references public.campers(id),
  program_id        uuid not null references public.programs(id),
  logged_by_user_id uuid not null references public.users(id),
  type              text not null check (type in ('nurse_visit', 'medication')),
  notes             text not null,
  medication_name   text,
  dosage            text,
  administered_at   timestamptz not null default now(),
  created_at        timestamptz not null default now()
);

create index idx_health_logs_camper on public.health_logs(camper_id);
create index idx_health_logs_program on public.health_logs(program_id);

-- ─── Messaging ────────────────────────────────────────────────────────────────

create table public.message_threads (
  id              uuid primary key default uuid_generate_v4(),
  camp_id         uuid not null references public.camps(id) on delete cascade,
  household_id    uuid not null references public.households(id) on delete cascade,
  subject         text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  last_message_at timestamptz not null default now()
);

create trigger message_threads_updated_at
  before update on public.message_threads
  for each row execute function update_updated_at();

create index idx_message_threads_camp on public.message_threads(camp_id);
create index idx_message_threads_household on public.message_threads(household_id);
create index idx_message_threads_last_message on public.message_threads(last_message_at desc);

create table public.messages (
  id             uuid primary key default uuid_generate_v4(),
  thread_id      uuid not null references public.message_threads(id) on delete cascade,
  sender_user_id uuid not null references public.users(id),
  body           text not null,
  read_at        timestamptz,
  created_at     timestamptz not null default now()
);

create index idx_messages_thread on public.messages(thread_id);
create index idx_messages_created_at on public.messages(created_at desc);

-- Auto-update thread's last_message_at on new message
create or replace function update_thread_last_message()
returns trigger as $$
begin
  update public.message_threads
  set last_message_at = new.created_at, updated_at = now()
  where id = new.thread_id;
  return new;
end;
$$ language plpgsql;

create trigger on_message_inserted
  after insert on public.messages
  for each row execute function update_thread_last_message();

-- ─── Notification Preferences ────────────────────────────────────────────────

create table public.notification_preferences (
  id         uuid primary key default uuid_generate_v4(),
  user_id    uuid not null references public.users(id) on delete cascade,
  camp_id    uuid not null references public.camps(id) on delete cascade,
  event_type text not null check (event_type in (
    'activity_posted', 'media_tagged', 'message_received',
    'check_in', 'check_out', 'health_log', 'announcement'
  )),
  channel    text not null check (channel in ('push', 'email', 'sms')),
  enabled    boolean not null default true,
  unique (user_id, camp_id, event_type, channel)
);

create index idx_notification_prefs_user on public.notification_preferences(user_id);
