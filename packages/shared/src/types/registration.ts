// ─── Registration & Invites ───────────────────────────────────────────────────

export interface ProgramInviteLink {
  id: string
  campId: string
  programId: string
  token: string
  expiresAt: string
  isActive: boolean
  createdByUserId: string
  createdAt: string
}

export type ImportedContactRole = 'guardian' | 'camper'

/**
 * Pre-loaded from CSV import.
 * When a parent signs up with a matching email, they are auto-approved
 * and linked to the pre-created household. Walk-ins without a match
 * go to pending status for staff review.
 */
export interface ImportedContact {
  id: string
  campId: string
  programId: string
  householdId: string | null
  email: string
  firstName: string
  lastName: string
  role: ImportedContactRole
  claimedAt: string | null
  claimedByUserId: string | null
  importedAt: string
  importedByUserId: string
}
