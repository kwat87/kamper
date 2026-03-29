-- ============================================================
-- Kamper: RLS Policies — Invite Links, Imported Contacts,
--         and Enrollment Status enforcement
-- ============================================================

-- ─── Enable RLS on new tables ────────────────────────────────────────────────

alter table public.program_invite_links enable row level security;
alter table public.imported_contacts    enable row level security;

-- ─── program_invite_links ────────────────────────────────────────────────────

-- Staff can view invite links for their camp
create policy "invite_links: staff can view"
  on public.program_invite_links for select
  using (is_staff_at_camp(camp_id));

-- Only admins and staff_admins can create/update/delete invite links
create policy "invite_links: admins can manage"
  on public.program_invite_links for all
  using (get_user_camp_role(camp_id) in ('super_admin', 'admin', 'staff_admin'));

-- Anyone can look up a link by token (needed for the registration flow)
-- Only returns active, non-expired links — no sensitive data exposed
create policy "invite_links: public token lookup"
  on public.program_invite_links for select
  using (is_active = true and expires_at > now());

-- ─── imported_contacts ───────────────────────────────────────────────────────

-- Admins can manage imported contacts for their camp
create policy "imported_contacts: admins can manage"
  on public.imported_contacts for all
  using (get_user_camp_role(camp_id) in ('super_admin', 'admin', 'staff_admin'));

-- Staff can view (for registration approval UI)
create policy "imported_contacts: staff can view"
  on public.imported_contacts for select
  using (is_staff_at_camp(camp_id));

-- ─── enrollments: enforce status on parent visibility ────────────────────────
-- Replace the existing enrollment select policy to exclude pending/rejected

drop policy if exists "enrollments: parents can view their camper enrollments"
  on public.enrollments;

create policy "enrollments: parents can view active enrollments"
  on public.enrollments for select
  using (
    -- Active parents see their active enrollments only
    (
      status = 'active'
      and exists(
        select 1 from public.campers c
        join public.household_members hm on hm.household_id = c.household_id
        where c.id = enrollments.camper_id and hm.user_id = auth.uid()
      )
    )
    -- Staff see all enrollments regardless of status
    or exists(
      select 1 from public.programs p
      where p.id = enrollments.program_id and is_staff_at_camp(p.camp_id)
    )
  );

-- ─── activities: restrict to active enrollments ──────────────────────────────
-- Parents with pending enrollment should not see the activity feed yet.
-- Drop and replace the existing activities select policy.

drop policy if exists "activities: parents can view global or tagged activities"
  on public.activities;

create policy "activities: parents can view global or tagged activities"
  on public.activities for select
  using (
    is_staff_at_camp(camp_id)
    or (
      visibility = 'global'
      and exists(
        select 1 from public.enrollments e
        join public.campers c on c.id = e.camper_id
        join public.household_members hm on hm.household_id = c.household_id
        where e.program_id = activities.program_id
          and e.status = 'active'        -- must be active, not pending
          and hm.user_id = auth.uid()
          and hm.can_view_media = true
      )
    )
    or (
      visibility = 'tagged'
      and exists(
        select 1 from public.activity_camper_tags act
        join public.campers c on c.id = act.camper_id
        join public.household_members hm on hm.household_id = c.household_id
        join public.enrollments e on e.camper_id = c.id
          and e.program_id = activities.program_id
        where act.activity_id = activities.id
          and e.status = 'active'        -- must be active, not pending
          and hm.user_id = auth.uid()
          and hm.can_view_media = true
      )
    )
  );

-- ─── households: tighten open registration ───────────────────────────────────
-- Remove the open insert policy. Household creation now only allowed
-- when arriving via a valid invite link token (enforced in the
-- registration Route Handler using the service role after token validation).
-- Direct client inserts are blocked.

drop policy if exists "households: parents can create (registration)"
  on public.households;

-- The registration Route Handler will use the service role key to create
-- households server-side after verifying the invite token. No client-side
-- household creation is permitted.
