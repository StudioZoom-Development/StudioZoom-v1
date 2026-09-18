import {
  collection,
  query,
  where,
  onSnapshot,
  addDoc,
  updateDoc,
  setDoc,
  doc,
  getDoc,
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

/**
 * Real-time subscription to all pending leave requests across all staff.
 * Used by Admin/Manager on Time Logs page.
 */
export function subscribeToPendingLeaveRequests(
  callback: (requests: LeaveRequest[]) => void
): () => void {
  const q = query(
    collection(db, 'leaveRequests'),
    where('status', '==', 'pending')
  )

  return onSnapshot(q, snap => {
    const requests = snap.docs.map(d => docToLeaveRequest(d.id, d.data() as Record<string, unknown>))
    requests.sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0))
    callback(requests)
  }, err => {
    console.error('[leaveRequests] subscribeToPendingLeaveRequests error:', err)
    callback([])
  })
}

// ─── Mutations ────────────────────────────────────────────────────────────────

/**
 * Submit a new leave/permission request with optional reason.
 * Guards against duplicate requests for the same date.
 * Returns the new requestId.
 */
export async function submitLeaveRequest(
  staffUid: string,
  date: string,
  type: LeaveRequestType,
  reason?: string
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
    reason:    reason || '',
    createdAt: serverTimestamp(),
  })

  return ref.id
}

/**
 * Accept / Approve a pending leave request:
 * Sets leaveRequest status to 'approved' and updates the Attendance
 * document status for this staff member and date to 'LV' (Leave).
 */
export async function approveLeaveRequest(
  requestId: string,
  staffUid: string,
  date: string,
  adminUid: string
): Promise<void> {
  // 1. Update leave request document
  await updateDoc(doc(db, 'leaveRequests', requestId), {
    status:     'approved',
    reviewedBy: adminUid,
    reviewedAt: serverTimestamp(),
  })

  // 2. Reflect on Attendance matrix (format: staffUid_year_month)
  const [yearStr, monthStr, dayStr] = date.split('-')
  const year = parseInt(yearStr, 10)
  const month = parseInt(monthStr, 10)
  const dayNum = parseInt(dayStr, 10)
  const attendanceDocId = `${staffUid}_${year}_${month}`
  const attRef = doc(db, 'attendance', attendanceDocId)

  const snap = await getDoc(attRef)
  if (snap.exists()) {
    await updateDoc(attRef, {
      [`dailyStatus.${dayNum}`]: 'LV',
      updatedAt: serverTimestamp(),
    })
  } else {
    await setDoc(attRef, {
      attendanceId: attendanceDocId,
      staffUid,
      year,
      month,
      dailyStatus: { [dayNum]: 'LV' },
      dailyHours: {},
      summary: {
        present: 0,
        late: 0,
        halfDay: 0,
        absent: 0,
        weekOff: 0,
        totalMinutes: 0,
      },
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  }
}

/**
 * Reject a pending leave request:
 * Sets leaveRequest status to 'rejected' and updates the Attendance
 * document status for this staff member and date to 'AB' (Absent).
 */
export async function rejectLeaveRequest(
  requestId: string,
  staffUid: string,
  date: string,
  adminUid: string
): Promise<void> {
  // 1. Update leave request document
  await updateDoc(doc(db, 'leaveRequests', requestId), {
    status:     'rejected',
    reviewedBy: adminUid,
    reviewedAt: serverTimestamp(),
  })

  // 2. Reflect on Attendance matrix (format: staffUid_year_month)
  const [yearStr, monthStr, dayStr] = date.split('-')
  const year = parseInt(yearStr, 10)
  const month = parseInt(monthStr, 10)
  const dayNum = parseInt(dayStr, 10)
  const attendanceDocId = `${staffUid}_${year}_${month}`
  const attRef = doc(db, 'attendance', attendanceDocId)

  const snap = await getDoc(attRef)
  if (snap.exists()) {
    await updateDoc(attRef, {
      [`dailyStatus.${dayNum}`]: 'AB',
      updatedAt: serverTimestamp(),
    })
  } else {
    await setDoc(attRef, {
      attendanceId: attendanceDocId,
      staffUid,
      year,
      month,
      dailyStatus: { [dayNum]: 'AB' },
      dailyHours: {},
      summary: {
        present: 0,
        late: 0,
        halfDay: 0,
        absent: 1,
        weekOff: 0,
        totalMinutes: 0,
      },
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  }
}
