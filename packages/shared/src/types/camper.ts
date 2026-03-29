// ─── Campers & Rosters ────────────────────────────────────────────────────────

export interface Camper {
  id: string
  campId: string
  householdId: string
  firstName: string
  lastName: string
  preferredName: string | null
  dateOfBirth: string   // ISO date
  photoUrl: string | null
  notes: string | null  // internal notes for staff
  createdAt: string
  updatedAt: string
}

export type EnrollmentStatus = 'active' | 'pending' | 'rejected'

/** Links a camper to a program (the roster) */
export interface Enrollment {
  id: string
  camperId: string
  programId: string
  status: EnrollmentStatus
  enrolledAt: string
}

// ─── Check-in / Check-out ─────────────────────────────────────────────────────

export type CheckType = 'check_in' | 'check_out'
export type AuthMethod = 'passcode' | 'signature'

export interface CheckEvent {
  id: string
  camperId: string
  programId: string
  type: CheckType
  authorizedBy: string        // userId (parent/guardian performing the action)
  authMethod: AuthMethod
  signatureUrl: string | null // stored in Supabase Storage if method = signature
  pickupPersonName: string | null
  pickupPersonIdVerified: boolean
  performedByStaff: string | null // userId of staff who confirmed
  timestamp: string
}
