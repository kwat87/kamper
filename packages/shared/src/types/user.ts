// ─── User Roles ───────────────────────────────────────────────────────────────

/**
 * Staff roles are scoped per-camp via staff_roles table.
 * A user can have different roles at different camps.
 */
export type StaffRole = 'super_admin' | 'admin' | 'staff_admin' | 'staff' | 'health'

export interface User {
  id: string            // matches auth.users.id in Supabase
  email: string
  firstName: string
  lastName: string
  avatarUrl: string | null
  phone: string | null
  createdAt: string
  updatedAt: string
}

/** Maps a staff user to a camp and their role there */
export interface StaffCampRole {
  id: string
  userId: string
  campId: string
  role: StaffRole
  createdAt: string
}

// ─── Households & Parents ─────────────────────────────────────────────────────

/**
 * Permission flags controlling what a parent can see.
 * Set by admins, not visible or editable by parents.
 */
export interface ParentPermissions {
  canViewMedia: boolean
  canViewHealthLogs: boolean
  canViewCheckInOut: boolean
  canMessage: boolean
}

export interface Household {
  id: string
  campId: string
  name: string          // e.g. "Smith Family"
  createdAt: string
  updatedAt: string
}

export interface HouseholdMember {
  id: string
  householdId: string
  userId: string
  isPrimary: boolean
  permissions: ParentPermissions
  createdAt: string
  updatedAt: string
}
