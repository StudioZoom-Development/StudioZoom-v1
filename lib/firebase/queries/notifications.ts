import {
  collection,
  query,
  where,
  onSnapshot,
  updateDoc,
  setDoc,
  doc,
  getDoc,
  getDocs,
  writeBatch,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import type { AppNotification, CreateNotificationInput, LeaveRequest, LeaveRequestType } from '@/types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function docToNotification(id: string, data: Record<string, unknown>): AppNotification {
  return {
    notificationId:      id,
    recipient:           data.recipient as string,
    recipientRole:       data.recipientRole as AppNotification['recipientRole'],
    type:                data.type as AppNotification['type'],
    referenceId:         data.referenceId as string,
    referenceCollection: (data.referenceCollection as 'leaveRequests') || 'leaveRequests',
    isRead:              Boolean(data.isRead),
    createdAt:           data.createdAt instanceof Timestamp
                           ? data.createdAt.toDate()
                           : data.createdAt ? new Date(data.createdAt as string) : new Date(),
    readAt:              data.readAt instanceof Timestamp
                           ? data.readAt.toDate()
                           : data.readAt ? new Date(data.readAt as string) : undefined,
    isDeleted:           Boolean(data.isDeleted),
  }
}

function docToLeaveRequest(id: string, data: Record<string, unknown>): LeaveRequest {
  return {
    requestId:   id,
    staffUid:    data.staffUid as string,
    date:        data.date as string,
    type:        data.type as LeaveRequestType,
    status:      data.status as LeaveRequest['status'],
    reason:      data.reason as string | undefined,
    createdAt:   data.createdAt instanceof Timestamp
                   ? data.createdAt.toDate()
                   : new Date(data.createdAt as string),
    reviewedBy:  data.reviewedBy as string | undefined,
    reviewedAt:  data.reviewedAt instanceof Timestamp
                   ? data.reviewedAt.toDate()
                   : data.reviewedAt
                     ? new Date(data.reviewedAt as string)
                     : undefined,
  }
}

// ─── Queries ──────────────────────────────────────────────────────────────────

/**
 * Real-time subscription to notifications addressed to any of the given recipientKeys.
 * e.g. for Admin: ['admin', appUser.uid]
 *      for Manager: ['manager', appUser.uid]
 *      for Staff: [appUser.uid]
 */
export function subscribeToNotifications(
  recipientKeys: string[],
  callback: (notifications: AppNotification[]) => void
): () => void {
  const validKeys = recipientKeys.filter(Boolean)
  if (validKeys.length === 0) {
    callback([])
    return () => {}
  }

  const q = query(
    collection(db, 'notifications'),
    where('recipient', 'in', validKeys.slice(0, 10))
  )

  return onSnapshot(q, snap => {
    const notifications = snap.docs
      .map(d => docToNotification(d.id, d.data() as Record<string, unknown>))
      .filter(n => !n.isDeleted)

    // Sort client-side by createdAt descending (most recent first)
    notifications.sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0))
    callback(notifications)
  }, err => {
    console.warn('[notifications] subscribeToNotifications warning:', err.message)
    callback([])
  })
}

/**
 * Fetch a single referenced LeaveRequest by document ID.
 */
export async function fetchReferencedLeaveRequest(requestId: string): Promise<LeaveRequest | null> {
  if (!requestId) return null
  try {
    const snap = await getDoc(doc(db, 'leaveRequests', requestId))
    if (!snap.exists()) return null
    return docToLeaveRequest(snap.id, snap.data() as Record<string, unknown>)
  } catch (err) {
    console.warn('[notifications] fetchReferencedLeaveRequest warning:', err)
    return null
  }
}

/**
 * Batch-fetch referenced LeaveRequests for displaying in notifications panel.
 */
export async function fetchReferencedLeaveRequestsBatch(
  requestIds: string[]
): Promise<Map<string, LeaveRequest>> {
  const map = new Map<string, LeaveRequest>()
  const uniqueIds = Array.from(new Set(requestIds.filter(Boolean)))
  if (uniqueIds.length === 0) return map

  // Firestore allows up to 30 elements in an 'in' query
  const chunks: string[][] = []
  for (let i = 0; i < uniqueIds.length; i += 30) {
    chunks.push(uniqueIds.slice(i, i + 30))
  }

  await Promise.all(
    chunks.map(async chunk => {
      try {
        const q = query(
          collection(db, 'leaveRequests'),
          where('__name__', 'in', chunk)
        )
        const snap = await getDocs(q)
        for (const docSnap of snap.docs) {
          map.set(docSnap.id, docToLeaveRequest(docSnap.id, docSnap.data() as Record<string, unknown>))
        }
      } catch (err) {
        console.warn('[notifications] batch fetch chunk warning:', err)
      }
    })
  )

  return map
}

// ─── Mutations ────────────────────────────────────────────────────────────────

/**
 * Create a new notification. Uses deterministic document ID to prevent duplicate
 * notifications without needing a cross-user read query.
 */
export async function createNotification(input: CreateNotificationInput): Promise<string> {
  const notifId = `${input.type}_${input.recipient}_${input.referenceId}`
  try {
    const docRef = doc(db, 'notifications', notifId)
    await setDoc(docRef, {
      recipient:           input.recipient,
      recipientRole:       input.recipientRole || null,
      type:                input.type,
      referenceId:         input.referenceId,
      referenceCollection: input.referenceCollection,
      isRead:              false,
      isDeleted:           false,
      createdAt:           serverTimestamp(),
    }, { merge: true })
    return notifId
  } catch (err: unknown) {
    console.warn('[notifications] createNotification warning:', err instanceof Error ? err.message : err)
    return notifId
  }
}

/**
 * Mark an individual notification as read.
 */
export async function markNotificationAsRead(notificationId: string): Promise<void> {
  if (!notificationId) return
  await updateDoc(doc(db, 'notifications', notificationId), {
    isRead: true,
    readAt: serverTimestamp(),
  })
}

/**
 * Mark all notifications for the given recipient keys as read.
 */
export async function markAllNotificationsAsRead(recipientKeys: string[]): Promise<void> {
  const validKeys = recipientKeys.filter(Boolean)
  if (validKeys.length === 0) return

  const q = query(
    collection(db, 'notifications'),
    where('recipient', 'in', validKeys.slice(0, 10)),
    where('isRead', '==', false)
  )

  const snap = await getDocs(q)
  if (snap.empty) return

  const batch = writeBatch(db)
  for (const docSnap of snap.docs) {
    batch.update(docSnap.ref, {
      isRead: true,
      readAt: serverTimestamp(),
    })
  }

  await batch.commit()
}
