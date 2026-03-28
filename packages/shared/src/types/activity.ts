// ─── Activities & Media Feed ──────────────────────────────────────────────────

export type ActivityVisibility = 'global' | 'tagged'
// global  = visible to all parents enrolled in the program
// tagged  = only visible to parents of tagged campers

export type DailyActivityType =
  | 'swimming'
  | 'canteen'
  | 'bible_time'
  | 'took_meds'
  | 'quiet_time'
  | 'rest_time'
  | 'breakfast'
  | 'lunch'
  | 'dinner'
  | 'snack'
  | 'custom'

export type ActivityType = 'daily_log' | 'photo' | 'video' | 'announcement'

export interface Activity {
  id: string
  campId: string
  programId: string
  postedByUserId: string
  type: ActivityType
  dailyActivityType: DailyActivityType | null // set when type = daily_log
  customLabel: string | null                   // set when dailyActivityType = custom
  caption: string | null
  visibility: ActivityVisibility
  occurredAt: string
  createdAt: string
  updatedAt: string
}

export type MediaType = 'photo' | 'video'

export interface ActivityMedia {
  id: string
  activityId: string
  mediaType: MediaType
  url: string           // Supabase Storage or Cloudinary URL
  thumbnailUrl: string | null
  width: number | null
  height: number | null
  durationSeconds: number | null  // for video
  createdAt: string
}

/** Tags a specific camper in an activity, making it visible to their household */
export interface ActivityCamperTag {
  id: string
  activityId: string
  camperId: string
  taggedByUserId: string
  createdAt: string
}

// ─── Health Logs ─────────────────────────────────────────────────────────────

export type HealthLogType = 'nurse_visit' | 'medication'

export interface HealthLog {
  id: string
  camperId: string
  programId: string
  loggedByUserId: string  // must have 'health' role
  type: HealthLogType
  notes: string
  medicationName: string | null
  dosage: string | null
  administeredAt: string
  createdAt: string
}
