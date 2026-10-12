import {
  collection, query, where, onSnapshot,
  doc, getDoc, updateDoc, setDoc, getDocs,
  serverTimestamp, Timestamp
} from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { isAllowedByTestMode } from '@/lib/utils/testMode'
import type { TimeLog } from '@/types'
import { getMonthTimeLogs, computeDayStatus, dayTotalMinutes } from './timeLogs'

export interface StaffMember {
  uid:         string
  name:        string
  email:       string
  contact?:    string
  jobTitle?:   string
  role:        'admin' | 'manager' | 'staff'
  skills?:     string[]
  joinDate?:   Date
  exitDate?:   Date
  baseSalary?: number
  isActive:    boolean
  photoURL?:   string | null
  createdAt?:  Date
  updatedAt?:  Date
}

export interface NewStaffInput {
  name:       string
  email:      string
  contact:    string
  jobTitle:   string
  role:       'staff' | 'manager'
  joinDate:   string
  baseSalary: number
}

function mapUserDocToStaffMember(id: string, data: Record<string, unknown>): StaffMember {
  const isActive = data.isActive !== undefined
    ? Boolean(data.isActive)
    : data.status !== undefined
      ? data.status === 'active'
      : true

  const baseSalary = data.baseSalary !== undefined
    ? Number(data.baseSalary)
    : data.monthlySalary !== undefined
      ? Number(data.monthlySalary)
      : undefined

  let joinDate: Date | undefined = undefined
  if (data.joinDate instanceof Timestamp) {
    joinDate = data.joinDate.toDate()
  } else if (data.joinDate && typeof data.joinDate === 'string' && !isNaN(new Date(data.joinDate).getTime())) {
    joinDate = new Date(data.joinDate)
  }

  return {
    ...data,
    uid: id,
    isActive,
    baseSalary,
    jobTitle: typeof data.jobTitle === 'string' ? data.jobTitle : '',
    joinDate,
    createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : data.createdAt ? new Date(data.createdAt as string | number | Date) : undefined,
    updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toDate() : data.updatedAt ? new Date(data.updatedAt as string | number | Date) : undefined,
  } as unknown as StaffMember
}

/** Real-time list — staff + managers, alphabetical */
export function subscribeToStaff(callback: (staff: StaffMember[]) => void): () => void {
  const q = query(
    collection(db, 'users'),
    where('role', 'in', ['staff', 'manager'])
  )
  return onSnapshot(q, snap => {
    const list = snap.docs
      .filter(d => !d.data().isDeleted && isAllowedByTestMode(d.data().createdAt, { isUser: true, email: d.data().email, name: d.data().name }))
      .map(d => mapUserDocToStaffMember(d.id, d.data()))
    // In-memory sort by name (alphabetical)
    list.sort((a, b) => (a.name || '').localeCompare(b.name || ''))
    callback(list)
  }, err => {
    console.warn('subscribeToStaff listener error:', err.message)
  })
}

/** Real-time list — staff ONLY (excluding admins & managers), alphabetical */
export function subscribeToStaffOnly(callback: (staff: StaffMember[]) => void): () => void {
  const q = query(
    collection(db, 'users'),
    where('role', '==', 'staff')
  )
  return onSnapshot(q, snap => {
    const list = snap.docs
      .filter(d => !d.data().isDeleted && isAllowedByTestMode(d.data().createdAt, { isUser: true, email: d.data().email, name: d.data().name }))
      .map(d => mapUserDocToStaffMember(d.id, d.data()))
    list.sort((a, b) => (a.name || '').localeCompare(b.name || ''))
    callback(list)
  }, err => {
    console.warn('subscribeToStaffOnly listener error:', err.message)
  })
}

/** Real-time list — ALL team members (admin, manager, staff), alphabetical */
export function subscribeToAllTeamMembers(callback: (staff: StaffMember[]) => void): () => void {
  const q = query(
    collection(db, 'users'),
    where('role', 'in', ['admin', 'manager', 'staff'])
  )
  return onSnapshot(q, snap => {
    const list = snap.docs
      .filter(d => !d.data().isDeleted)
      .map(d => mapUserDocToStaffMember(d.id, d.data()))
    list.sort((a, b) => (a.name || '').localeCompare(b.name || ''))
    callback(list)
  })
}

/** Single staff by UID */
export async function getStaffMember(uid: string): Promise<StaffMember | null> {
  const snap = await getDoc(doc(db, 'users', uid))
  if (!snap.exists()) return null
  return mapUserDocToStaffMember(snap.id, snap.data())
}

/** Update profile fields */
export async function updateStaffProfile(
  uid: string,
  updates: { name?: string; contact?: string; email?: string; jobTitle?: string; joinDate?: string; baseSalary?: number }
): Promise<void> {
  const payload: Record<string, unknown> = { updatedAt: serverTimestamp() }
  if (updates.name)       payload.name       = updates.name
  if (updates.contact)    payload.contact    = updates.contact
  if (updates.email)      payload.email      = updates.email
  if (updates.jobTitle)   payload.jobTitle   = updates.jobTitle
  if (updates.baseSalary !== undefined) payload.baseSalary = updates.baseSalary
  if (updates.joinDate)   payload.joinDate   = Timestamp.fromDate(new Date(updates.joinDate))
  await updateDoc(doc(db, 'users', uid), payload)
}

/** Soft deactivate / reactivate */
export async function deactivateStaff(uid: string): Promise<void> {
  await updateDoc(doc(db, 'users', uid), { isActive: false, status: 'inactive', updatedAt: serverTimestamp() })
}
export async function reactivateStaff(uid: string): Promise<void> {
  await updateDoc(doc(db, 'users', uid), { isActive: true, status: 'active', updatedAt: serverTimestamp() })
}

/** Add staff — writes Firestore only (Auth user creation requires Admin SDK/Cloud Function) */
export async function addStaffMember(data: NewStaffInput): Promise<string> {
  const tempUid = `staff_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
  await setDoc(doc(db, 'users', tempUid), {
    uid:        tempUid,
    name:       data.name,
    email:      data.email,
    contact:    data.contact.startsWith('+91') ? data.contact : `+91 ${data.contact.trim()}`,
    jobTitle:   data.jobTitle,
    role:       data.role,
    joinDate:   data.joinDate ? Timestamp.fromDate(new Date(data.joinDate)) : serverTimestamp(),
    baseSalary: data.baseSalary,
    status:     'active',
    isActive:   true,
    photoURL:   null,
    createdAt:  serverTimestamp(),
    updatedAt:  serverTimestamp(),
  })
  return tempUid
}

export interface StaffAttendanceSummary {
  present: number
  late: number
  absent: number
  halfDay: number
  leave: number
  totalMinutes: number
  hoursLabel: string
}

/** Attendance summary for detail page — computed dynamically matching Attendance grid */
export async function getAttendanceSummary(
  uid: string,
  year: number,
  month: number
): Promise<StaffAttendanceSummary> {
  try {
    const now = new Date()
    const monthStr = String(month).padStart(2, '0')
    const daysInMonth = new Date(year, month, 0).getDate()

    // 1. Fetch attendance document if any
    const snap = await getDoc(doc(db, 'attendance', `${uid}_${year}_${month}`))
    const attData = snap.exists() ? snap.data() : null

    // 2. Fetch staff's time logs for the month
    const logs = await getMonthTimeLogs(uid, year, month)
    const logsByDate: Record<string, TimeLog[]> = {}
    for (const log of logs) {
      if (!logsByDate[log.date]) logsByDate[log.date] = []
      logsByDate[log.date].push(log)
    }

    // 3. Fetch approved leave requests for the staff in this month
    const prefix = `${year}-${monthStr}-`
    const leaveQ = query(
      collection(db, 'leaveRequests'),
      where('staffUid', '==', uid)
    )
    const leaveSnap = await getDocs(leaveQ)
    const approvedLeaveMap: Record<string, boolean> = {}
    for (const d of leaveSnap.docs) {
      const data = d.data()
      if (data.status === 'approved' && typeof data.date === 'string' && data.date.startsWith(prefix)) {
        approvedLeaveMap[data.date] = true
      }
    }

    const dailyStatus = (attData?.dailyStatus as Record<string, unknown>) || {}
    const dailyHours = (attData?.dailyHours as Record<string, number>) || {}

    let P = 0,
      L = 0,
      H = 0,
      LV = 0,
      AB = 0,
      totalMinutes = 0

    for (let day = 1; day <= daysInMonth; day++) {
      const dayStr = `${year}-${monthStr}-${String(day).padStart(2, '0')}`

      const rawDocStatus = dailyStatus[day] || dailyStatus[String(day)] || dailyStatus[dayStr]

      let status: string | null = null
      if (rawDocStatus) {
        const norm = String(rawDocStatus).toUpperCase()
        if (norm === 'P' || norm === 'PRESENT') status = 'P'
        else if (norm === 'L' || norm === 'LATE') status = 'L'
        else if (norm === 'H' || norm === 'HALFDAY') status = 'H'
        else if (norm === 'LV' || norm === 'LEAVE') status = 'LV'
        else if (norm === 'AB' || norm === 'ABSENT') status = 'AB'
        else status = norm
      } else {
        const sessions = logsByDate[dayStr] ?? []
        const approvedLeave = Boolean(approvedLeaveMap[dayStr])
        status = computeDayStatus(sessions, dayStr, now, approvedLeave)
      }

      let minutes = 0
      if (dailyHours[day] != null) {
        minutes = dailyHours[day]
      } else if (dailyHours[String(day)] != null) {
        minutes = dailyHours[String(day)]
      } else if (dailyHours[dayStr] != null) {
        minutes = dailyHours[dayStr]
      } else {
        const sessions = logsByDate[dayStr] ?? []
        minutes = dayTotalMinutes(sessions, now, dayStr)
      }

      if (status === 'P') P++
      if (status === 'L') L++
      if (status === 'H') H++
      if (status === 'LV') LV++
      if (status === 'AB') AB++
      totalMinutes += minutes
    }

    // If no daily status or logs existed, check if attData has a pre-baked summary
    if (P === 0 && L === 0 && H === 0 && LV === 0 && AB === 0 && totalMinutes === 0 && attData?.summary) {
      const s = attData.summary as Record<string, number>
      P = s.present || 0
      L = s.late || 0
      H = s.halfDay || 0
      LV = s.leave || 0
      AB = s.absent || 0
      totalMinutes = s.totalMinutes || 0
    }

    const h = Math.floor(totalMinutes / 60)
    return {
      present: P,
      late: L,
      halfDay: H,
      leave: LV,
      absent: AB,
      totalMinutes,
      hoursLabel: `${h}h`
    }
  } catch (err) {
    console.error('Failed to get attendance summary:', err)
    return {
      present: 0,
      late: 0,
      halfDay: 0,
      leave: 0,
      absent: 0,
      totalMinutes: 0,
      hoursLabel: '0h'
    }
  }
}

/** Real-time subscription to ALL attendance documents for a given year & month */
export function subscribeToAllAttendanceRecords(
  year: number,
  month: number,
  callback: (recordsMap: Record<string, import('@/types').AttendanceRecord>) => void
): () => void {
  const q = query(
    collection(db, 'attendance'),
    where('year', '==', year),
    where('month', '==', month)
  )

  return onSnapshot(q, snap => {
    const map: Record<string, import('@/types').AttendanceRecord> = {}
    for (const d of snap.docs) {
      const data = d.data()
      map[data.staffUid] = {
        attendanceId: d.id,
        staffUid: data.staffUid as string,
        year: data.year as number,
        month: data.month as number,
        dailyStatus: (data.dailyStatus as Record<string, import('@/types').AttendanceStatus>) || {},
        dailyHours: (data.dailyHours as Record<string, number>) || {},
        summary: data.summary as import('@/types').AttendanceRecord['summary'],
      }
    }
    callback(map)
  }, err => {
    console.error('[staff] subscribeToAllAttendanceRecords error:', err)
    callback({})
  })
}

/** Payslip history for detail page */
export async function getPayslipHistory(uid: string): Promise<Array<{
  payslipId: string; payslipNumber: string; month: number; year: number; netPay: number
}>> {
  try {
    const q = query(collection(db, 'payslips'), where('staffUid', '==', uid))
    const snap = await getDocs(q)
    const list = snap.docs.map(d => ({
      payslipId:     d.id,
      payslipNumber: d.data().payslipNumber ?? '',
      month:         d.data().month as number,
      year:          d.data().year as number,
      netPay:        d.data().netPay as number,
    }))
    list.sort((a, b) => b.year - a.year || b.month - a.month)
    return list
  } catch (err) {
    console.error('Failed to get payslip history:', err)
    return []
  }
}

const DEMO_STAFF_WORK: Record<string, Array<{ projectId: string; eventName: string; eventDate: string; role: string; stage: string }>> = {
  'staff-kavya': [
    { projectId: 'demo-proj-2', eventName: 'Divya & Arjun Wedding', eventDate: '2026-09-09', role: 'photographer', stage: 'preProduction' },
    { projectId: 'demo-proj-5', eventName: 'Priya & Karthik Reception', eventDate: '2026-05-18', role: 'lead_photo', stage: 'delivered' },
    { projectId: 'demo-proj-3', eventName: 'Sneha & Rahul Sangeet', eventDate: '2026-07-22', role: 'photographer', stage: 'delivered' },
  ],
  'staff-deepak': [
    { projectId: 'demo-proj-6', eventName: 'Aishwarya & Naveen Wedding', eventDate: '2026-06-10', role: 'videographer', stage: 'preProduction' },
    { projectId: 'demo-proj-1', eventName: 'Meera & Rohan Engagement', eventDate: '2026-08-15', role: 'lead_video', stage: 'eventDay' },
  ],
  'staff-siva': [
    { projectId: 'demo-proj-3', eventName: 'Sneha & Rahul Sangeet', eventDate: '2026-07-22', role: 'videographer', stage: 'delivered' },
    { projectId: 'demo-proj-2', eventName: 'Divya & Arjun Wedding', eventDate: '2026-09-09', role: 'drone', stage: 'preProduction' },
  ],
  'staff-ramesh': [
    { projectId: 'demo-proj-4', eventName: 'Ananya & Vikram Wedding', eventDate: '2026-04-05', role: 'editor', stage: 'delivered' },
    { projectId: 'demo-proj-1', eventName: 'Meera & Rohan Highlights', eventDate: '2026-08-20', role: 'videoEditing', stage: 'postProduction' },
  ],
  'staff-naresh': [
    { projectId: 'demo-proj-2', eventName: 'Divya & Arjun Wedding', eventDate: '2026-09-09', role: 'lead_photo', stage: 'preProduction' },
    { projectId: 'demo-proj-4', eventName: 'Ananya & Vikram Wedding', eventDate: '2026-04-05', role: 'lead_photo', stage: 'delivered' },
  ],
  'staff-anitha': [
    { projectId: 'demo-proj-2', eventName: 'Divya & Arjun Album', eventDate: '2026-09-15', role: 'albumDesign', stage: 'postProduction' },
    { projectId: 'demo-proj-5', eventName: 'Priya & Karthik Photo Edit', eventDate: '2026-05-25', role: 'photoEditing', stage: 'delivered' },
  ],
}

/** Work history for detail page — via projects (staffUids), workItems (assignedToUid), and staffAssignments */
export async function getWorkHistory(uid: string): Promise<Array<{
  projectId: string; eventName: string; eventDate: string; role: string; stage: string
}>> {
  try {
    const historyMap = new Map<string, {
      projectId: string; eventName: string; eventDate: string; role: string; stage: string
    }>()

    // 1. Query projects where staffUids contains uid
    try {
      const projQ = query(
        collection(db, 'projects'),
        where('staffUids', 'array-contains', uid)
      )
      const projSnap = await getDocs(projQ)
      projSnap.docs.forEach(d => {
        const p = d.data()
        if (p.isDeleted) return
        const evDate = p.eventDate
          ? (typeof p.eventDate.toDate === 'function'
              ? p.eventDate.toDate().toISOString().split('T')[0]
              : new Date(p.eventDate).toISOString().split('T')[0])
          : ''
        historyMap.set(`proj-${d.id}`, {
          projectId: d.id,
          eventName: p.eventName || 'Unnamed Event',
          eventDate: evDate,
          role: 'staff',
          stage: p.stage || 'booked',
        })
      })
    } catch (err) {
      console.warn('Could not query projects by staffUids:', err)
    }

    // 2. Query workItems where assignedToUid == uid
    try {
      const workQ = query(
        collection(db, 'workItems'),
        where('assignedToUid', '==', uid)
      )
      const workSnap = await getDocs(workQ)
      workSnap.docs.forEach(d => {
        const w = d.data()
        if (w.isDeleted) return
        const evDate = w.eventDate
          ? (typeof w.eventDate.toDate === 'function'
              ? w.eventDate.toDate().toISOString().split('T')[0]
              : new Date(w.eventDate).toISOString().split('T')[0])
          : ''
        const stage = w.status === 'done'
          ? 'delivered'
          : w.status === 'review'
          ? 'postProduction'
          : w.status === 'inProgress'
          ? 'eventDay'
          : 'planning'

        const key = `work-${w.projectId || d.id}-${w.type || 'task'}`
        historyMap.set(key, {
          projectId: w.projectId || d.id,
          eventName: w.eventName || 'Unnamed Work',
          eventDate: evDate,
          role: w.type || 'editor',
          stage,
        })
      })
    } catch (err) {
      console.warn('Could not query workItems by assignedToUid:', err)
    }

    // 3. Query staffAssignments (legacy / direct assignments)
    try {
      const assignQ = query(
        collection(db, 'staffAssignments'),
        where('staffUid', '==', uid)
      )
      const assignSnap = await getDocs(assignQ)
      for (const d of assignSnap.docs) {
        const a = d.data()
        let eventName = '—'
        let stage = '—'
        if (a.projectId) {
          try {
            const proj = await getDoc(doc(db, 'projects', a.projectId))
            if (proj.exists()) {
              const p = proj.data()
              eventName = p?.eventName ?? '—'
              stage = p?.stage ?? '—'
            }
          } catch {
            // fallback
          }
        }
        const key = `assign-${d.id}`
        historyMap.set(key, {
          projectId: a.projectId ?? '',
          eventName,
          eventDate: (a.eventDate as string) || '',
          role: (a.role as string) || 'staff',
          stage,
        })
      }
    } catch (err) {
      console.warn('Could not query staffAssignments:', err)
    }

    const list = Array.from(historyMap.values())

    // If no records found in database, check demo fallback for mock staff members
    if (list.length === 0 && DEMO_STAFF_WORK[uid]) {
      return DEMO_STAFF_WORK[uid]
    }

    list.sort((a, b) => (b.eventDate || '').localeCompare(a.eventDate || ''))
    return list.slice(0, 30)
  } catch (err) {
    console.error('Failed to get work history:', err)
    return DEMO_STAFF_WORK[uid] || []
  }
}
