// ─── Camp & Program ──────────────────────────────────────────────────────────

export type CampStatus = 'active' | 'inactive' | 'archived'

export interface Camp {
  id: string
  name: string
  slug: string
  logoUrl: string | null
  timezone: string
  status: CampStatus
  createdAt: string
  updatedAt: string
}

export interface Program {
  id: string
  campId: string
  name: string          // e.g. "5th & 6th Grade Camp"
  description: string | null
  startDate: string     // ISO date
  endDate: string       // ISO date
  isActive: boolean
  createdAt: string
  updatedAt: string
}
