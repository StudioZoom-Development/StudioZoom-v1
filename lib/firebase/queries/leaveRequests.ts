import {
  collection,
  query,
  where,
  onSnapshot,
  addDoc,
  getDocs,
  Timestamp,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import type { LeaveRequest, LeaveRequestType } from '@/types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function docToLeaveRequest(id: string, data: Record<string, unknown>): LeaveRequest {
  return {
    requestId:   id,
    staffUid:    data.staffUid as string,
    date:        data.date as string,
    type:        data.type as LeaveRequestType,
    status:      data.status as LeaveRequest['status'],
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
 * Real-time subscription to the logged-in user's leave requests
 * for a given month (YYYY-MM prefix). Returns unsubscribe function.
 */
export function subscribeToMyLeaveRequests(
  staffUid: string,
  year: number,
  month: number,
  callback: (requests: LeaveRequest[]) => void
): () => void {
  const monthStr = String(month).padStart(2, '0')
  const prefix   = `${year}-${monthStr}-`

  const q = query(
    collection(db, 'leaveRequests'),
    where('staffUid', '==', staffUid)
  )

  return onSnapshot(q, snap => {
    const requests = snap.docs
      .map(d => docToLeaveRequest(d.id, d.data() as Record<string, unknown>))
      .filter(r => r.date.startsWith(prefix))
    requests.sort((a, b) => a.date.localeCompare(b.date))
    callback(requests)
  }, err => {
    console.error('[leaveRequests] subscribe error:', err)
    callback([])
  })
}

/**
 * Real-time subscription to ALL leave requests for a given month.
 * Used by Admin/Manager Team Attendance view.
 */
export function subscribeToAllLeaveRequests(
  year: number,
  month: number,
  callback: (requests: LeaveRequest[]) => void
): () => void {
  const monthStr = String(month).padStart(2, '0')
  const prefix   = `${year}-${monthStr}-`

  const q = collection(db, 'leaveRequests')

  return onSnapshot(q, snap => {
    const requests = snap.docs
      .map(d => docToLeaveRequest(d.id, d.data() as Record<string, unknown>))
      .filter(r => r.date.startsWith(prefix))
    requests.sort((a, b) => a.date.localeCompare(b.date))
    callback(requests)
  }, err => {
    console.error('[leaveRequests] subscribeToAllLeaveRequests error:', err)
    callback([])
  })
}

// ─── Mutations ────────────────────────────────────────────────────────────────

/**
 * Submit a new leave/permission request.
 * Guards against duplicate requests for the same date.
 * Returns the new requestId.
 */
export async function submitLeaveRequest(
  staffUid: string,
  date: string,
  type: LeaveRequestType
): Promise<string> {
  // Guard: check for existing request on same date
  const q = query(
    collection(db, 'leaveRequests'),
    where('staffUid', '==', staffUid),
    where('date', '==', date)
  )
  const existing = await getDocs(q)
  if (!existing.empty) {
    const dup = existing.docs[0].data()
    if (dup.status === 'approved') {
      throw new Error('A leave request for this date has already been approved.')
    }
    if (dup.status === 'pending') {
      throw new Error('A leave request for this date is already pending approval.')
    }
  }

  const ref = await addDoc(collection(db, 'leaveRequests'), {
    staffUid,
    date,
    type,
    status:    'pending',
    createdAt: serverTimestamp(),
  })

  return ref.id
}
