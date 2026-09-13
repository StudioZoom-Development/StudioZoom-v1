import {
  collection,
  query,
  where,
  onSnapshot,
  addDoc,
  updateDoc,
  doc,
  getDocs,
  Timestamp,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import type { TimeLog } from '@/types'

// ─── Constants ────────────────────────────────────────────────────────────────
export const STANDARD_MINUTES = 540 // 9 hours

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Convert a Firestore doc to a typed TimeLog */
function docToTimeLog(id: string, data: Record<string, unknown>): TimeLog {
  return {
    logId:             id,
    staffUid:          data.staffUid as string,
    date:              data.date as string,
    checkInAt:         data.checkInAt instanceof Timestamp
                         ? data.checkInAt.toDate()
                         : new Date(data.checkInAt as string),
    checkOutAt:        data.checkOutAt instanceof Timestamp
                         ? data.checkOutAt.toDate()
                         : data.checkOutAt
                           ? new Date(data.checkOutAt as string)
                           : undefined,
    workedMinutes:     data.workedMinutes as number | undefined,
    standardMinutes:   STANDARD_MINUTES as 540,
    variance:          data.variance as number | undefined,
    status:            data.status as TimeLog['status'],
    overrideStatus:    data.overrideStatus as TimeLog['overrideStatus'],
    correctedBy:       data.correctedBy as string | undefined,
    correctionReason:  data.correctionReason as string | undefined,
  }
}

/** Returns today's date string in "YYYY-MM-DD" local time */
export function getTodayDateString(): string {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

// ─── Queries ──────────────────────────────────────────────────────────────────

/**
 * Real-time subscription to all time log sessions for a given staff member
 * on a given date (YYYY-MM-DD). Returns unsubscribe function.
 */
export function subscribeToTodayTimeLogs(
  staffUid: string,
  date: string,
  callback: (logs: TimeLog[]) => void
): () => void {
  const q = query(
    collection(db, 'timeLogs'),
    where('staffUid', '==', staffUid),
    where('date', '==', date)
  )

  return onSnapshot(q, snap => {
    const logs = snap.docs.map(d => docToTimeLog(d.id, d.data() as Record<string, unknown>))
    logs.sort((a, b) => (a.checkInAt?.getTime() ?? 0) - (b.checkInAt?.getTime() ?? 0))
    callback(logs)
  }, err => {
    console.error('[timeLogs] subscribe error:', err)
    callback([])
  })
}

/**
 * One-shot fetch of today's sessions (used post-action to recompute state
 * without waiting for snapshot re-emission).
 */
export async function getTodayTimeLogs(staffUid: string, date: string): Promise<TimeLog[]> {
  const q = query(
    collection(db, 'timeLogs'),
    where('staffUid', '==', staffUid),
    where('date', '==', date)
  )
  const snap = await getDocs(q)
  const logs = snap.docs.map(d => docToTimeLog(d.id, d.data() as Record<string, unknown>))
  logs.sort((a, b) => (a.checkInAt?.getTime() ?? 0) - (b.checkInAt?.getTime() ?? 0))
  return logs
}

// ─── Mutations ────────────────────────────────────────────────────────────────

/**
 * Check In: creates a new open time log session.
 * Guards against duplicate open sessions.
 * Returns the new logId, or throws if already checked in.
 */
export async function checkIn(staffUid: string): Promise<string> {
  const date = getTodayDateString()

  // Guard: check for existing open session
  const existing = await getTodayTimeLogs(staffUid, date)
  const hasOpenSession = existing.some(l => l.status === 'open')
  if (hasOpenSession) {
    throw new Error('Already checked in. Please check out first.')
  }

  const ref = await addDoc(collection(db, 'timeLogs'), {
    staffUid,
    date,
    checkInAt:       serverTimestamp(),
    checkOutAt:      null,
    workedMinutes:   null,
    standardMinutes: STANDARD_MINUTES,
    variance:        null,
    status:          'open',
    createdAt:       serverTimestamp(),
    updatedAt:       serverTimestamp(),
  })

  return ref.id
}

/**
 * Check Out: closes the current open session.
 * Computes workedMinutes and variance.
 * Returns worked minutes for this session.
 */
export async function checkOut(
  staffUid: string
): Promise<{ workedMinutes: number; logId: string }> {
  const date = getTodayDateString()
  const sessions = await getTodayTimeLogs(staffUid, date)
  const openSession = sessions.find(l => l.status === 'open')

  if (!openSession) {
    throw new Error('No active session found. Please check in first.')
  }

  const now = new Date()
  const checkInTime = openSession.checkInAt
  const sessionMs = now.getTime() - checkInTime.getTime()
  const sessionMinutes = Math.max(0, Math.floor(sessionMs / 60000))

  // Compute total worked minutes for the day (all closed + this session)
  const closedMinutes = sessions
    .filter(l => l.status === 'closed' && l.workedMinutes != null)
    .reduce((sum, l) => sum + (l.workedMinutes ?? 0), 0)

  const totalDayMinutes = closedMinutes + sessionMinutes
  const variance = totalDayMinutes - STANDARD_MINUTES

  await updateDoc(doc(db, 'timeLogs', openSession.logId), {
    checkOutAt:    Timestamp.fromDate(now),
    workedMinutes: sessionMinutes,
    variance,
    status:        'closed',
    updatedAt:     serverTimestamp(),
  })

  return { workedMinutes: sessionMinutes, logId: openSession.logId }
}

// ─── Formatting Helpers ───────────────────────────────────────────────────────

/** Format total seconds into "Xh Ym" display string */
export function formatDuration(totalSeconds: number): string {
  const absSeconds = Math.abs(totalSeconds)
  const h = Math.floor(absSeconds / 3600)
  const m = Math.floor((absSeconds % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

/** Format total minutes into "Xh Ym" */
export function formatMinutes(minutes: number): string {
  const h = Math.floor(Math.abs(minutes) / 60)
  const m = Math.abs(minutes) % 60
  return `${h}h ${m}m`
}

/** Format a Date into "HH:MM AM/PM" */
export function formatTime12h(date: Date): string {
  let hours = date.getHours()
  const minutes = String(date.getMinutes()).padStart(2, '0')
  const ampm = hours >= 12 ? 'PM' : 'AM'
  hours = hours % 12 || 12
  return `${hours}:${minutes} ${ampm}`
}

// ─── Month-scope Queries ──────────────────────────────────────────────────────

/**
 * Fetch ALL time log sessions for a given staff member in a given month.
 * Filters by staffUid only (no index needed) and narrows dates in-memory.
 * Returns sessions sorted by date then checkInAt ascending.
 */
export async function getMonthTimeLogs(
  staffUid: string,
  year: number,
  month: number
): Promise<TimeLog[]> {
  try {
    // Build date-string prefix "YYYY-MM-" to filter in-memory
    const monthStr = String(month).padStart(2, '0')
    const prefix = `${year}-${monthStr}-`

    const q = query(
      collection(db, 'timeLogs'),
      where('staffUid', '==', staffUid)
    )
    const snap = await getDocs(q)
    const all = snap.docs
      .map(d => docToTimeLog(d.id, d.data() as Record<string, unknown>))
      .filter(l => l.date.startsWith(prefix))

    all.sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date)
      return (a.checkInAt?.getTime() ?? 0) - (b.checkInAt?.getTime() ?? 0)
    })
    return all
  } catch (err) {
    console.error('[timeLogs] getMonthTimeLogs error:', err)
    return []
  }
}

// ─── Attendance Status Computation ───────────────────────────────────────────

export type DayStatus = 'P' | 'L' | 'H' | 'AB' | 'LV' | null

/** Late threshold: 9:30 AM in minutes-since-midnight */
const LATE_THRESHOLD_MINUTES = 9 * 60 + 30  // 570
const HALF_DAY_MINUTES       = 270           // 4.5 hours
const PRESENT_MINUTES        = 540           // 9 hours

/**
 * Compute the attendance status for a single calendar day.
 *
 * @param sessions   All timeLogs for this day (may be empty)
 * @param dateStr    "YYYY-MM-DD" of the day being evaluated
 * @param now        Current datetime (for running-session calculation)
 * @param hasApprovedLeave  Whether an admin-approved leave request covers this day
 *
 * Rules:
 *   - Approved leave             → LV
 *   - No sessions, day in past   → AB
 *   - Sessions exist:
 *       totalMinutes ≥ 540       → P
 *       first check-in > 09:30 AND totalMinutes < 540 → L
 *       totalMinutes < 270 AND day fully ended         → H
 *       otherwise                → P
 *   - Future day with no sessions → null
 */
export function computeDayStatus(
  sessions:        TimeLog[],
  dateStr:         string,
  now:             Date,
  hasApprovedLeave: boolean
): DayStatus {
  if (hasApprovedLeave) return 'LV'

  const todayStr  = getTodayDateString()
  const isPast    = dateStr < todayStr
  const isToday   = dateStr === todayStr
  const isFuture  = dateStr > todayStr

  // Future days with no sessions → show nothing
  if (isFuture && sessions.length === 0) return null

  if (sessions.length === 0) {
    // Past day with no check-in and no approved leave → Absent
    if (isPast) return 'AB'
    // Today, no check-in yet → null (don't mark absent until day ends)
    return null
  }

  // Calculate total worked minutes
  const closedMinutes = sessions
    .filter(s => s.status === 'closed' && s.workedMinutes != null)
    .reduce((sum, s) => sum + (s.workedMinutes ?? 0), 0)

  const openSession = sessions.find(s => s.status === 'open')
  const runningMinutes = (isToday && openSession)
    ? Math.max(0, Math.floor((now.getTime() - openSession.checkInAt.getTime()) / 60000))
    : 0

  const totalMinutes = closedMinutes + runningMinutes

  // Day is fully ended if it's past OR today with no open session
  const dayFullyEnded = isPast || (isToday && !openSession)

  // First check-in time
  const firstSession = sessions.reduce((earliest, s) =>
    s.checkInAt.getTime() < earliest.checkInAt.getTime() ? s : earliest
  )
  const firstCheckInMinutes =
    firstSession.checkInAt.getHours() * 60 + firstSession.checkInAt.getMinutes()
  const isLateArrival = firstCheckInMinutes > LATE_THRESHOLD_MINUTES

  // 9h+ worked → Present regardless of check-in time
  if (totalMinutes >= PRESENT_MINUTES) return 'P'

  // Half Day: < 4.5 hours and day is fully ended (calculated next day)
  if (dayFullyEnded && totalMinutes < HALF_DAY_MINUTES && totalMinutes > 0) return 'H'

  // Late: arrived after 9:30 and < 9h (and day is fully ended for finality)
  if (isLateArrival && dayFullyEnded) return 'L'

  // Otherwise: present (day still running, or checked in on time)
  return 'P'
}

/** Format minutes as "Xh Ym" — used in attendance hours column */
export function formatWorkedMinutes(minutes: number): string {
  if (minutes <= 0) return '—'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m}m`
  return `${h}h ${m}m`
}

/**
 * Real-time subscription to ALL time logs for a given date (e.g. today).
 * Used by Admin/Manager Team Time Clock.
 */
export function subscribeToAllTodayTimeLogs(
  date: string,
  callback: (logs: TimeLog[]) => void
): () => void {
  const q = query(
    collection(db, 'timeLogs'),
    where('date', '==', date)
  )

  return onSnapshot(q, snap => {
    const logs = snap.docs.map(d => docToTimeLog(d.id, d.data() as Record<string, unknown>))
    logs.sort((a, b) => (a.checkInAt?.getTime() ?? 0) - (b.checkInAt?.getTime() ?? 0))
    callback(logs)
  }, err => {
    console.error('[timeLogs] subscribeToAllTodayTimeLogs error:', err)
    callback([])
  })
}

/**
 * Manual Admin/Manager correction of a staff member's check-in time & status for a date.
 * Updates existing session or creates a new one if staff had no session.
 */
export async function correctStaffTimeLog(params: {
  staffUid: string
  date: string             // "YYYY-MM-DD"
  checkInTimeStr: string   // "HH:MM" (24h string)
  status: 'In' | 'Late' | 'Not in'
  correctedByUid: string
}): Promise<void> {
  const { staffUid, date, checkInTimeStr, status, correctedByUid } = params

  // Fetch existing time logs for this staffUid on this date
  const sessions = await getTodayTimeLogs(staffUid, date)

  if (status === 'Not in') {
    // Mark existing session(s) with overrideStatus = 'Not in'
    for (const session of sessions) {
      await updateDoc(doc(db, 'timeLogs', session.logId), {
        overrideStatus: 'Not in',
        correctedBy:    correctedByUid,
        updatedAt:      serverTimestamp(),
      })
    }
    return
  }

  // Parse checkInTimeStr ("HH:MM" or "HH:MM AM/PM") into Date for date
  const [yearStr, monthStr, dayStr] = date.split('-')
  let hours = 9
  let minutes = 0

  const match12 = checkInTimeStr.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i)
  if (match12) {
    hours = parseInt(match12[1], 10)
    minutes = parseInt(match12[2], 10)
    const ampm = match12[3].toUpperCase()
    if (ampm === 'PM' && hours < 12) hours += 12
    if (ampm === 'AM' && hours === 12) hours = 0
  } else {
    const parts = checkInTimeStr.split(':')
    hours = parseInt(parts[0], 10) || 0
    minutes = parseInt(parts[1], 10) || 0
  }

  const checkInDate = new Date(
    parseInt(yearStr, 10),
    parseInt(monthStr, 10) - 1,
    parseInt(dayStr, 10),
    hours,
    minutes,
    0
  )

  if (sessions.length > 0) {
    // Update primary/first session
    const primary = sessions[0]
    await updateDoc(doc(db, 'timeLogs', primary.logId), {
      checkInAt:      Timestamp.fromDate(checkInDate),
      overrideStatus: status,
      correctedBy:    correctedByUid,
      updatedAt:      serverTimestamp(),
    })
  } else {
    // Create a new timeLog entry for this staff member today
    await addDoc(collection(db, 'timeLogs'), {
      staffUid,
      date,
      checkInAt:       Timestamp.fromDate(checkInDate),
      checkOutAt:      null,
      workedMinutes:   null,
      standardMinutes: STANDARD_MINUTES,
      variance:        null,
      status:          'open',
      overrideStatus:  status,
      correctedBy:     correctedByUid,
      createdAt:       serverTimestamp(),
      updatedAt:       serverTimestamp(),
    })
  }
}

/**
 * Fetch ALL time log sessions for ALL staff in a given month.
 * Returns a map of staffUid -> TimeLog[].
 */
export async function getAllStaffMonthTimeLogs(
  year: number,
  month: number
): Promise<Record<string, TimeLog[]>> {
  try {
    const monthStr = String(month).padStart(2, '0')
    const prefix = `${year}-${monthStr}-`

    const snap = await getDocs(collection(db, 'timeLogs'))
    const map: Record<string, TimeLog[]> = {}
    for (const d of snap.docs) {
      const data = d.data() as Record<string, unknown>
      const dateStr = data.date as string
      if (dateStr && dateStr.startsWith(prefix)) {
        const log = docToTimeLog(d.id, data)
        if (!map[log.staffUid]) map[log.staffUid] = []
        map[log.staffUid].push(log)
      }
    }
    for (const uid in map) {
      map[uid].sort((a, b) => {
        if (a.date !== b.date) return a.date.localeCompare(b.date)
        return (a.checkInAt?.getTime() ?? 0) - (b.checkInAt?.getTime() ?? 0)
      })
    }
    return map
  } catch (err) {
    console.error('[timeLogs] getAllStaffMonthTimeLogs error:', err)
    return {}
  }
}


