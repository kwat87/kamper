-- ============================================================
-- Kamper: Row-Level Security Policies
-- ============================================================
-- Core principle:
--   - Staff access is governed by staff_camp_roles
--   - Parent access is governed by household_members + permissions flags
--   - Every table is scoped to camp_id
-- ============================================================

-- ─── Helper functions ─────────────────────────────────────────────────────────

-- Returns the current user's role at a given camp (null if none)
create or replace function get_user_camp_role(p_camp_id uuid)
returns text as $$
  select role from public.staff_camp_roles
  where user_id = auth.uid() and camp_id = p_camp_id
  limit 1;
$$ language sql security definer stable;

-- Returns true if the current user is staff at the given camp
create or replace function is_staff_at_camp(p_camp_id uuid)
returns boolean as $$
  select exists(
    select 1 from public.staff_camp_roles
    where user_id = auth.uid() and camp_id = p_camp_id
  );
$$ language sql security definer stable;

-- Returns true if the current user is a parent/guardian in a household at a camp
create or replace function is_parent_at_camp(p_camp_id uuid)
returns boolean as $$
  select exists(
    select 1
    from public.household_members hm
    join public.households h on h.id = hm.household_id
    where hm.user_id = auth.uid() and h.camp_id = p_camp_id
  );
$$ language sql security definer stable;

-- Returns true if user has a specific permission flag in their household membership
create or replace function parent_has_permission(p_camp_id uuid, p_permission text)
returns boolean as $$
  select case p_permission
    when 'can_view_media'        then bool_or(hm.can_view_media)
    when 'can_view_health_logs'  then bool_or(hm.can_view_health_logs)
    when 'can_view_check_in_out' then bool_or(hm.can_view_check_in_out)
    when 'can_message'           then bool_or(hm.can_message)
    else false
  end
  from public.household_members hm
  join public.households h on h.id = hm.household_id
  where hm.user_id = auth.uid() and h.camp_id = p_camp_id;
$$ language sql security definer stable;

-- ─── Enable RLS on all tables ─────────────────────────────────────────────────

alter table public.camps                    enable row level security;
alter table public.users                    enable row level security;
alter table public.staff_camp_roles         enable row level security;
alter table public.programs                 enable row level security;
alter table public.households               enable row level security;
alter table public.household_members        enable row level security;
alter table public.campers                  enable row level security;
alter table public.enrollments              enable row level security;
alter table public.check_events             enable row level security;
alter table public.activities               enable row level security;
alter table public.activity_media           enable row level security;
alter table public.activity_camper_tags     enable row level security;
alter table public.health_logs              enable row level security;
alter table public.message_threads          enable row level security;
alter table public.messages                 enable row level security;
alter table public.notification_preferences enable row level security;

-- ─── camps ────────────────────────────────────────────────────────────────────

-- Anyone with a role at the camp or a household at the camp can see it
create policy "camps: staff and parents can view their camp"
  on public.camps for select
  using (
    is_staff_at_camp(id) or is_parent_at_camp(id)
  );

-- Only super_admins can manage camps (via service role in practice)
create policy "camps: super_admin full access"
  on public.camps for all
  using (get_user_camp_role(id) = 'super_admin');

-- ─── users ────────────────────────────────────────────────────────────────────

-- Users can read/update their own profile
create policy "users: read own profile"
  on public.users for select
  using (id = auth.uid());

create policy "users: update own profile"
  on public.users for update
  using (id = auth.uid());

-- Staff can view other users at their camp (for messaging, tagging, etc.)
create policy "users: staff can view users at their camps"
  on public.users for select
  using (
    exists(
      select 1 from public.staff_camp_roles scr1
      join public.staff_camp_roles scr2 on scr1.camp_id = scr2.camp_id
      where scr1.user_id = auth.uid() and scr2.user_id = users.id
    )
    or
    -- Parents can see other members of their household
    exists(
      select 1 from public.household_members hm1
      join public.household_members hm2 on hm1.household_id = hm2.household_id
      where hm1.user_id = auth.uid() and hm2.user_id = users.id
    )
  );

-- ─── staff_camp_roles ────────────────────────────────────────────────────────

create policy "staff_camp_roles: staff can view roles at their camp"
  on public.staff_camp_roles for select
  using (is_staff_at_camp(camp_id));

create policy "staff_camp_roles: admins can manage roles"
  on public.staff_camp_roles for all
  using (get_user_camp_role(camp_id) in ('super_admin', 'admin'));

-- ─── programs ─────────────────────────────────────────────────────────────────

create policy "programs: staff and parents can view"
  on public.programs for select
  using (is_staff_at_camp(camp_id) or is_parent_at_camp(camp_id));

create policy "programs: admins can manage"
  on public.programs for all
  using (get_user_camp_role(camp_id) in ('super_admin', 'admin', 'staff_admin'));

-- ─── households ──────────────────────────────────────────────────────────────

create policy "households: members can view their own"
  on public.households for select
  using (
    exists(
      select 1 from public.household_members
      where household_id = households.id and user_id = auth.uid()
    )
    or is_staff_at_camp(camp_id)
  );

create policy "households: admins can manage"
  on public.households for all
  using (get_user_camp_role(camp_id) in ('super_admin', 'admin', 'staff_admin'));

create policy "households: parents can create (registration)"
  on public.households for insert
  with check (true);  -- registration flow; tighten with invite codes later

-- ─── household_members ───────────────────────────────────────────────────────

create policy "household_members: members can view their household"
  on public.household_members for select
  using (
    user_id = auth.uid()
    or exists(
      select 1 from public.household_members hm2
      where hm2.household_id = household_members.household_id
        and hm2.user_id = auth.uid()
    )
    or exists(
      select 1 from public.households h
      join public.staff_camp_roles scr on scr.camp_id = h.camp_id
      where h.id = household_members.household_id and scr.user_id = auth.uid()
    )
  );

create policy "household_members: admins can manage permissions"
  on public.household_members for all
  using (
    exists(
      select 1 from public.households h
      where h.id = household_members.household_id
        and get_user_camp_role(h.camp_id) in ('super_admin', 'admin')
    )
  );

create policy "household_members: parents can add themselves"
  on public.household_members for insert
  with check (user_id = auth.uid());

-- ─── campers ─────────────────────────────────────────────────────────────────

create policy "campers: parents can view their household campers"
  on public.campers for select
  using (
    exists(
      select 1 from public.household_members
      where household_id = campers.household_id and user_id = auth.uid()
    )
    or is_staff_at_camp(camp_id)
  );

create policy "campers: admins and staff_admin can manage"
  on public.campers for all
  using (get_user_camp_role(camp_id) in ('super_admin', 'admin', 'staff_admin'));

create policy "campers: parents can create (registration)"
  on public.campers for insert
  with check (
    exists(
      select 1 from public.household_members
      where household_id = campers.household_id and user_id = auth.uid()
    )
  );

-- ─── enrollments ─────────────────────────────────────────────────────────────

create policy "enrollments: parents can view their camper enrollments"
  on public.enrollments for select
  using (
    exists(
      select 1 from public.campers c
      join public.household_members hm on hm.household_id = c.household_id
      where c.id = enrollments.camper_id and hm.user_id = auth.uid()
    )
    or exists(
      select 1 from public.campers c
      join public.programs p on p.id = enrollments.program_id
      where c.id = enrollments.camper_id and is_staff_at_camp(p.camp_id)
    )
  );

create policy "enrollments: admins can manage"
  on public.enrollments for all
  using (
    exists(
      select 1 from public.programs p
      where p.id = enrollments.program_id
        and get_user_camp_role(p.camp_id) in ('super_admin', 'admin', 'staff_admin')
    )
  );

-- ─── check_events ────────────────────────────────────────────────────────────

create policy "check_events: parents can view if they have permission"
  on public.check_events for select
  using (
    exists(
      select 1 from public.campers c
      join public.households h on h.id = c.household_id
      join public.household_members hm on hm.household_id = h.id
      where c.id = check_events.camper_id
        and hm.user_id = auth.uid()
        and hm.can_view_check_in_out = true
    )
    or exists(
      select 1 from public.programs p
      where p.id = check_events.program_id and is_staff_at_camp(p.camp_id)
    )
  );

create policy "check_events: parents can insert (check in/out)"
  on public.check_events for insert
  with check (
    authorized_by_user_id = auth.uid()
    and exists(
      select 1 from public.campers c
      join public.household_members hm on hm.household_id = c.household_id
      where c.id = check_events.camper_id
        and hm.user_id = auth.uid()
        and hm.can_view_check_in_out = true
    )
  );

create policy "check_events: staff can insert and view"
  on public.check_events for all
  using (
    exists(
      select 1 from public.programs p
      where p.id = check_events.program_id and is_staff_at_camp(p.camp_id)
    )
  );

-- ─── activities ───────────────────────────────────────────────────────────────

-- Global activities: visible to all parents enrolled in the program
-- Tagged activities: only visible to parents of tagged campers
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
        where act.activity_id = activities.id
          and hm.user_id = auth.uid()
          and hm.can_view_media = true
      )
    )
  );

create policy "activities: staff can post"
  on public.activities for insert
  with check (
    posted_by_user_id = auth.uid()
    and is_staff_at_camp(camp_id)
  );

create policy "activities: staff can update own posts"
  on public.activities for update
  using (posted_by_user_id = auth.uid() and is_staff_at_camp(camp_id));

create policy "activities: admins can delete"
  on public.activities for delete
  using (get_user_camp_role(camp_id) in ('super_admin', 'admin', 'staff_admin'));

-- ─── activity_media ───────────────────────────────────────────────────────────

create policy "activity_media: inherit from activity"
  on public.activity_media for select
  using (
    exists(
      select 1 from public.activities a
      where a.id = activity_media.activity_id
    )
  );

create policy "activity_media: staff can insert"
  on public.activity_media for insert
  with check (
    exists(
      select 1 from public.activities a
      where a.id = activity_media.activity_id
        and is_staff_at_camp(a.camp_id)
    )
  );

-- ─── activity_camper_tags ────────────────────────────────────────────────────

create policy "activity_camper_tags: staff can view"
  on public.activity_camper_tags for select
  using (
    exists(
      select 1 from public.activities a
      where a.id = activity_camper_tags.activity_id
        and is_staff_at_camp(a.camp_id)
    )
  );

create policy "activity_camper_tags: parents can view tags for their campers"
  on public.activity_camper_tags for select
  using (
    exists(
      select 1 from public.campers c
      join public.household_members hm on hm.household_id = c.household_id
      where c.id = activity_camper_tags.camper_id
        and hm.user_id = auth.uid()
    )
  );

create policy "activity_camper_tags: staff can tag"
  on public.activity_camper_tags for insert
  with check (
    tagged_by_user_id = auth.uid()
    and exists(
      select 1 from public.activities a
      where a.id = activity_camper_tags.activity_id
        and is_staff_at_camp(a.camp_id)
    )
  );

-- ─── health_logs ──────────────────────────────────────────────────────────────

create policy "health_logs: health staff and admins can view and insert"
  on public.health_logs for select
  using (
    exists(
      select 1 from public.programs p
      where p.id = health_logs.program_id
        and get_user_camp_role(p.camp_id) in ('super_admin', 'admin', 'staff_admin', 'health')
    )
  );

create policy "health_logs: health role can insert"
  on public.health_logs for insert
  with check (
    logged_by_user_id = auth.uid()
    and exists(
      select 1 from public.programs p
      where p.id = health_logs.program_id
        and get_user_camp_role(p.camp_id) in ('super_admin', 'admin', 'health')
    )
  );

create policy "health_logs: parents can view if permitted"
  on public.health_logs for select
  using (
    exists(
      select 1 from public.campers c
      join public.household_members hm on hm.household_id = c.household_id
      where c.id = health_logs.camper_id
        and hm.user_id = auth.uid()
        and hm.can_view_health_logs = true
    )
  );

-- ─── message_threads ─────────────────────────────────────────────────────────

create policy "message_threads: household members can view their threads"
  on public.message_threads for select
  using (
    exists(
      select 1 from public.household_members
      where household_id = message_threads.household_id
        and user_id = auth.uid()
    )
    or is_staff_at_camp(camp_id)
  );

create policy "message_threads: household members can create if permitted"
  on public.message_threads for insert
  with check (
    exists(
      select 1 from public.household_members hm
      where hm.household_id = message_threads.household_id
        and hm.user_id = auth.uid()
        and hm.can_message = true
    )
  );

-- ─── messages ─────────────────────────────────────────────────────────────────

create policy "messages: thread participants can view"
  on public.messages for select
  using (
    exists(
      select 1 from public.message_threads mt
      join public.household_members hm on hm.household_id = mt.household_id
      where mt.id = messages.thread_id and hm.user_id = auth.uid()
    )
    or exists(
      select 1 from public.message_threads mt
      where mt.id = messages.thread_id and is_staff_at_camp(mt.camp_id)
    )
  );

create policy "messages: participants can send"
  on public.messages for insert
  with check (
    sender_user_id = auth.uid()
    and (
      exists(
        select 1 from public.message_threads mt
        join public.household_members hm on hm.household_id = mt.household_id
        where mt.id = messages.thread_id
          and hm.user_id = auth.uid()
          and hm.can_message = true
      )
      or exists(
        select 1 from public.message_threads mt
        where mt.id = messages.thread_id and is_staff_at_camp(mt.camp_id)
      )
    )
  );

-- ─── notification_preferences ────────────────────────────────────────────────

create policy "notification_preferences: users manage their own"
  on public.notification_preferences for all
  using (user_id = auth.uid());
