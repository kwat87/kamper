-- ============================================================
-- Kamper: Invite Links + Enrollment Status
-- ============================================================
-- Adds:
--   1. enrollment.status — controls parent visibility while pending
--   2. program_invite_links — QR code tokens scoped to a program
--   3. imported_contacts — pre-loaded email records from CSV import
--      used to auto-approve parents who were on the roster
-- ============================================================

-- ─── 1. Enrollment status ────────────────────────────────────────────────────

alter table public.enrollments
  add column status text not null default 'active'
    check (status in ('active', 'pending', 'rejected'));

-- Index for the common query: "show me all pending enrollments for this program"
create index idx_enrollments_status on public.enrollments(program_id, status)
  where status = 'pending';

-- ─── 2. Program invite links ─────────────────────────────────────────────────
-- One link per program. Embedded in the QR code as:
--   https://app.kamper.com/join?token=<token>
-- Expires at program end date by default, but can be set explicitly.

create table public.program_invite_links (
  id                uuid primary key default uuid_generate_v4(),
  camp_id           uuid not null references public.camps(id) on delete cascade,
  program_id        uuid not null references public.programs(id) on delete cascade,
  token             text not null unique default encode(gen_random_bytes(24), 'base64url'),
  expires_at        timestamptz not null,
  is_active         boolean not null default true,
  created_by_user_id uuid not null references public.users(id),
  created_at        timestamptz not null default now(),
  unique (program_id)   -- one active link per program at a time
);

create index idx_invite_links_token on public.program_invite_links(token)
  where is_active = true;
create index idx_invite_links_program on public.program_invite_links(program_id);

-- ─── 3. Imported contacts ────────────────────────────────────────────────────
-- Pre-loaded from CSV import. When a parent registers with a matching email
-- at a matching camp, their enrollment is auto-approved and they are linked
-- to the pre-created household. Walk-ins without a matching record go to
-- pending status for staff review.

create table public.imported_contacts (
  id              uuid primary key default uuid_generate_v4(),
  camp_id         uuid not null references public.camps(id) on delete cascade,
  program_id      uuid not null references public.programs(id) on delete cascade,
  household_id    uuid references public.households(id) on delete set null,
  email           text not null,
  first_name      text not null,
  last_name       text not null,
  role            text not null default 'guardian'
                    check (role in ('guardian', 'camper')),
  claimed_at      timestamptz,        -- set when the parent creates their account
  claimed_by_user_id uuid references public.users(id),
  imported_at     timestamptz not null default now(),
  imported_by_user_id uuid not null references public.users(id),
  unique (camp_id, program_id, email)
);

create index idx_imported_contacts_email on public.imported_contacts(camp_id, lower(email));
create index idx_imported_contacts_household on public.imported_contacts(household_id);
create index idx_imported_contacts_program on public.imported_contacts(program_id);

-- ─── Function: resolve registration on new user signup ───────────────────────
-- Called after a new user is created. Checks if their email matches any
-- imported_contacts records. If so, links them to the household and
-- sets their enrollments to active. Otherwise they remain pending.

create or replace function resolve_registration_on_signup()
returns trigger as $$
declare
  v_contact record;
begin
  -- Find all imported contact records for this email (case-insensitive)
  for v_contact in
    select * from public.imported_contacts
    where lower(email) = lower(new.email)
      and claimed_at is null
  loop
    -- Mark the contact as claimed
    update public.imported_contacts
    set claimed_at = now(), claimed_by_user_id = new.id
    where id = v_contact.id;

    -- Link user to the household as a member if not already
    if v_contact.household_id is not null and v_contact.role = 'guardian' then
      insert into public.household_members (household_id, user_id, is_primary)
      values (v_contact.household_id, new.id, false)
      on conflict (household_id, user_id) do nothing;

      -- Activate any pending enrollments for campers in this household
      update public.enrollments e
      set status = 'active'
      from public.campers c
      where e.camper_id = c.id
        and c.household_id = v_contact.household_id
        and e.program_id = v_contact.program_id
        and e.status = 'pending';
    end if;
  end loop;

  return new;
end;
$$ language plpgsql security definer;

-- Wire up to the existing users table (fires after handle_new_auth_user creates the row)
create trigger on_user_created_resolve_registration
  after insert on public.users
  for each row execute function resolve_registration_on_signup();
