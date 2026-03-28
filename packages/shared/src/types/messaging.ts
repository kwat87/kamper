// ─── Messaging ────────────────────────────────────────────────────────────────

/**
 * Threads are always between a household and the camp (not individual staff).
 * Staff with permission can view and reply. Campers are not participants.
 */
export interface MessageThread {
  id: string
  campId: string
  householdId: string
  subject: string | null
  createdAt: string
  updatedAt: string
  lastMessageAt: string
}

export interface Message {
  id: string
  threadId: string
  senderUserId: string
  body: string
  readAt: string | null
  createdAt: string
}

// ─── Notifications ────────────────────────────────────────────────────────────

export type NotificationChannel = 'push' | 'email' | 'sms'

export type NotificationEventType =
  | 'activity_posted'
  | 'media_tagged'
  | 'message_received'
  | 'check_in'
  | 'check_out'
  | 'health_log'
  | 'announcement'

export interface NotificationPreference {
  id: string
  userId: string
  campId: string
  eventType: NotificationEventType
  channel: NotificationChannel
  enabled: boolean
}
