import {
  collection,
  query,
  where,
  onSnapshot,
  addDoc,
  updateDoc,
  setDoc,
  doc,
  getDocs,
  Timestamp,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import type { TimeLog, TimeLogCorrection } from '@/types'

// ─── Constants ────────────────────────────────────────────────────────────────
export const STANDARD_MINUTES = 540 // 9 hours

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Safely parse any timestamp representation (Firestore Timestamp, serialized object, Date, string, number)
 * into a valid Date object. Guards against null, undefined, and Unix epoch (1970-01-01) corruption.
 */
function parseTimestampSafe(raw: unknown, fallback?: Date): Date {
  const defaultFallback = fallback && !isNaN(fallback.getTime()) && fallback.getFullYear() >= 2000
    ? fallback
    : new Date()

  if (!raw) return defaultFallback

  if (raw instanceof Date) {
    return isNaN(raw.getTime()) || raw.getFullYear() < 2000 ? defaultFallback : raw
  }

  if (raw instanceof Timestamp) {
    try {
      const d = raw.toDate()
      return isNaN(d.getTime()) || d.getFullYear() < 2000 ? defaultFallback : d
    } catch {
      return defaultFallback
    }
  }

  if (typeof (raw as { toDate?: () => Date })?.toDate === 'function') {
    try {
      const d = (raw as { toDate: () => Date }).toDate()
      return isNaN(d.getTime()) || d.getFullYear() < 2000 ? defaultFallback : d
    } catch {
      return defaultFallback
    }
  }

  if (typeof raw === 'object' && raw !== null && 'seconds' in raw && typeof (raw as { seconds: number }).seconds === 'number') {
    const d = new Date((raw as { seconds: number }).seconds * 1000)
    return isNaN(d.getTime()) || d.getFullYear() < 2000 ? defaultFallback : d
  }

  if (typeof raw === 'string' || typeof raw === 'number') {
    const d = new Date(raw)
    return isNaN(d.getTime()) || d.getFullYear() < 2000 ? defaultFallback : d
  }

  return defaultFallback
}

function parseOptionalTimestampSafe(raw: unknown): Date | undefined {
  if (!raw) return undefined
  const d = parseTimestampSafe(raw)
  if (isNaN(d.getTime()) || d.getFullYear() < 2000) return undefined
  return d
}

/** Convert a Firestore doc to a typed TimeLog */
function docToTimeLog(id: string, data: Record<string, unknown>): TimeLog {
  const createdAt = parseTimestampSafe(data.createdAt, new Date())
  const checkInAt = parseTimestampSafe(data.checkInAt, createdAt)
  const checkOutAt = parseOptionalTimestampSafe(data.checkOutAt)

  return {
    logId:              id,
    staffUid:           data.staffUid as string,
    date:               (data.date as string) || getTodayDateString(),
    checkInAt,
    checkOutAt,
    workedMinutes:      typeof data.workedMinutes === 'number' ? data.workedMinutes : undefined,
    standardMinutes:    STANDARD_MINUTES as 540,
    variance:           typeof data.variance === 'number' ? data.variance : undefined,
    status:             data.status as TimeLog['status'],
    overrideStatus:     data.overrideStatus as TimeLog['overrideStatus'],
    isCorrected:        data.isCorrected as boolean | undefined,
    originalCheckInAt:  parseOptionalTimestampSafe(data.originalCheckInAt),
    originalCheckOutAt: parseOptionalTimestampSafe(data.originalCheckOutAt),
    correctedBy:        data.correctedBy as string | undefined,
    correctionReason:   data.correctionReason as string | undefined,
    correctedAt:        parseOptionalTimestampSafe(data.correctedAt),
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
    const logs = snap.docs.map(d => docToTimeLog(d.id, d.data({ serverTimestamps: 'estimate' }) as Record<string, unknown>))
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
  const logs = snap.docs.map(d => docToTimeLog(d.id, d.data({ serverTimestamps: 'estimate' }) as Record<string, unknown>))
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

  const now = new Date()
  const ref = await addDoc(collection(db, 'timeLogs'), {
    staffUid,
    date,
    checkInAt:       Timestamp.fromDate(now),
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
  let checkInTime = openSession.checkInAt
  if (!checkInTime || isNaN(checkInTime.getTime()) || checkInTime.getFullYear() < 2000) {
    checkInTime = now
  }
  const sessionMs = Math.max(0, now.getTime() - checkInTime.getTime())
  // Cap single session worked minutes at 1440 (24 hours) as an integrity safety guard
  const sessionMinutes = Math.min(Math.max(0, Math.floor(sessionMs / 60000)), 1440)

  // Compute total worked minutes for the day (all closed + this session)
  const closedMinutes = sessions
    .filter(l => l.status === 'closed' && typeof l.workedMinutes === 'number' && l.workedMinutes > 0 && l.logId !== openSession.logId)
    .reduce((sum, l) => sum + Math.min(l.workedMinutes ?? 0, 1440), 0)

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
export function formatTime12h(date: Date | null | undefined): string {
  if (!date || isNaN(date.getTime()) || date.getFullYear() < 2000) {
    return '—'
  }
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
    .filter(s => s.status === 'closed' && typeof s.workedMinutes === 'number' && s.workedMinutes > 0)
    .reduce((sum, s) => sum + Math.min(s.workedMinutes ?? 0, 1440), 0)

  const openSession = sessions.find(s => s.status === 'open')
  let runningMinutes = 0
  if (isToday && openSession && openSession.checkInAt && openSession.checkInAt.getFullYear() >= 2000) {
    const diff = Math.floor((now.getTime() - openSession.checkInAt.getTime()) / 60000)
    if (diff > 0 && diff <= 1440) runningMinutes = diff
  }

  const totalMinutes = closedMinutes + runningMinutes

  // Day is fully ended if it's past OR today with no open session
  const dayFullyEnded = isPast || (isToday && !openSession)

  // First check-in time
  const validSessions = sessions.filter(s => s.checkInAt && s.checkInAt.getFullYear() >= 2000)
  const firstSession = validSessions.length > 0
    ? validSessions.reduce((earliest, s) => s.checkInAt.getTime() < earliest.checkInAt.getTime() ? s : earliest)
    : sessions[0]

  const firstCheckInMinutes = firstSession && firstSession.checkInAt && firstSession.checkInAt.getFullYear() >= 2000
    ? firstSession.checkInAt.getHours() * 60 + firstSession.checkInAt.getMinutes()
    : 0
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

/** Sum all closed + running minutes for a day's sessions */
export function dayTotalMinutes(sessions: TimeLog[], now: Date, dateStr: string): number {
  const todayStr = getTodayDateString()
  const closed = sessions
    .filter(s => s.status === 'closed' && typeof s.workedMinutes === 'number' && s.workedMinutes > 0)
    .reduce((sum, s) => sum + Math.min(s.workedMinutes ?? 0, 1440), 0)
  const openSession = sessions.find(s => s.status === 'open')
  let running = 0
  if (dateStr === todayStr && openSession && openSession.checkInAt && openSession.checkInAt.getFullYear() >= 2000) {
    const diff = Math.floor((now.getTime() - openSession.checkInAt.getTime()) / 60000)
    if (diff > 0 && diff <= 1440) running = diff
  }
  return closed + running
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

// ─── Time Logs Page Specific Queries ──────────────────────────────────────────

/**
 * Real-time subscription to time logs for a given date.
 * Optionally filtered by staffUid.
 */
export function subscribeTimeLogsForDate(
  date: string,
  staffUid: string | undefined,
  callback: (logs: TimeLog[]) => void
): () => void {
  const constraints = [where('date', '==', date)]
  if (staffUid && staffUid !== 'all') {
    constraints.push(where('staffUid', '==', staffUid))
  }

  const q = query(collection(db, 'timeLogs'), ...constraints)

  return onSnapshot(q, snap => {
    const logs = snap.docs.map(d => docToTimeLog(d.id, d.data() as Record<string, unknown>))
    logs.sort((a, b) => (a.checkInAt?.getTime() ?? 0) - (b.checkInAt?.getTime() ?? 0))
    callback(logs)
  }, err => {
    console.error('[timeLogs] subscribeTimeLogsForDate error:', err)
    callback([])
  })
}

/**
 * Real-time subscription to all time logs for a given staff member (for Staff login view).
 */
export function subscribeTimeLogsForStaff(
  staffUid: string,
  callback: (logs: TimeLog[]) => void
): () => void {
  const q = query(
    collection(db, 'timeLogs'),
    where('staffUid', '==', staffUid)
  )

  return onSnapshot(q, snap => {
    const logs = snap.docs.map(d => docToTimeLog(d.id, d.data() as Record<string, unknown>))
    logs.sort((a, b) => {
      if (a.date !== b.date) return b.date.localeCompare(a.date)
      return (a.checkInAt?.getTime() ?? 0) - (b.checkInAt?.getTime() ?? 0)
    })
    callback(logs)
  }, err => {
    console.error('[timeLogs] subscribeTimeLogsForStaff error:', err)
    callback([])
  })
}

/**
 * Real-time subscription to ALL time logs (Admin/Manager view).
 */
export function subscribeAllTimeLogs(
  callback: (logs: TimeLog[]) => void
): () => void {
  const q = query(collection(db, 'timeLogs'))

  return onSnapshot(q, snap => {
    const logs = snap.docs.map(d => docToTimeLog(d.id, d.data() as Record<string, unknown>))
    logs.sort((a, b) => {
      if (a.date !== b.date) return b.date.localeCompare(a.date)
      return (a.checkInAt?.getTime() ?? 0) - (b.checkInAt?.getTime() ?? 0)
    })
    callback(logs)
  }, err => {
    console.error('[timeLogs] subscribeAllTimeLogs error:', err)
    callback([])
  })
}

/**
 * Save a time log correction (Fix flow and View edit flow).
 * Creates/updates record in timeLogCorrections collection
 * and updates the corresponding timeLogs document.
 */
export async function saveTimeLogCorrection(params: {
  logId?:           string
  staffUid:         string
  date:             string       // "YYYY-MM-DD"
  oldCheckIn:       Date | null
  oldCheckOut:      Date | null
  newCheckIn:       Date
  newCheckOut:      Date
  reason:           string
  correctedByUid:   string
  correctedByName?: string
}): Promise<string> {
  const {
    logId,
    staffUid,
    date,
    oldCheckIn,
    oldCheckOut,
    newCheckIn,
    newCheckOut,
    reason,
    correctedByUid,
    correctedByName,
  } = params

  const diffMs = newCheckOut.getTime() - newCheckIn.getTime()
  const workedMinutes = Math.max(0, Math.floor(diffMs / 60000))
  const variance = workedMinutes - STANDARD_MINUTES

  let targetLogId = logId

  if (targetLogId) {
    await updateDoc(doc(db, 'timeLogs', targetLogId), {
      checkInAt:          Timestamp.fromDate(newCheckIn),
      checkOutAt:         Timestamp.fromDate(newCheckOut),
      workedMinutes,
      variance,
      status:             'corrected',
      isCorrected:        true,
      originalCheckInAt:  oldCheckIn ? Timestamp.fromDate(oldCheckIn) : null,
      originalCheckOutAt: oldCheckOut ? Timestamp.fromDate(oldCheckOut) : null,
      correctionReason:   reason,
      correctedBy:        correctedByUid,
      correctedAt:        serverTimestamp(),
      updatedAt:          serverTimestamp(),
    })
  } else {
    const newDoc = await addDoc(collection(db, 'timeLogs'), {
      staffUid,
      date,
      checkInAt:          Timestamp.fromDate(newCheckIn),
      checkOutAt:         Timestamp.fromDate(newCheckOut),
      workedMinutes,
      standardMinutes:    STANDARD_MINUTES,
      variance,
      status:             'corrected',
      isCorrected:        true,
      originalCheckInAt:  oldCheckIn ? Timestamp.fromDate(oldCheckIn) : null,
      originalCheckOutAt: oldCheckOut ? Timestamp.fromDate(oldCheckOut) : null,
      correctionReason:   reason,
      correctedBy:        correctedByUid,
      correctedAt:        serverTimestamp(),
      createdAt:          serverTimestamp(),
      updatedAt:          serverTimestamp(),
    })
    targetLogId = newDoc.id
  }

  // Record audit entry in timeLogCorrections collection
  const corrRef = doc(collection(db, 'timeLogCorrections'))
  await setDoc(corrRef, {
    correctionId:     corrRef.id,
    logId:            targetLogId,
    staffUid,
    date,
    oldCheckIn:       oldCheckIn ? Timestamp.fromDate(oldCheckIn) : null,
    oldCheckOut:      oldCheckOut ? Timestamp.fromDate(oldCheckOut) : null,
    newCheckIn:       Timestamp.fromDate(newCheckIn),
    newCheckOut:      Timestamp.fromDate(newCheckOut),
    reason,
    correctedBy:      correctedByUid,
    correctedByName:  correctedByName || '',
    correctedAt:      serverTimestamp(),
  })

  return targetLogId
}

/**
 * Fetch latest correction for a given time log or staff date.
 */
export async function getTimeLogCorrection(logId: string): Promise<TimeLogCorrection | null> {
  try {
    const q = query(
      collection(db, 'timeLogCorrections'),
      where('logId', '==', logId)
    )
    const snap = await getDocs(q)
    if (snap.empty) return null
    const docs = snap.docs.map(d => {
      const data = d.data()
      return {
        correctionId:    d.id,
        logId:           data.logId as string | undefined,
        staffUid:        data.staffUid as string,
        date:            data.date as string,
        oldCheckIn:      data.oldCheckIn instanceof Timestamp ? data.oldCheckIn.toDate() : data.oldCheckIn ? new Date(data.oldCheckIn as string) : null,
        oldCheckOut:     data.oldCheckOut instanceof Timestamp ? data.oldCheckOut.toDate() : data.oldCheckOut ? new Date(data.oldCheckOut as string) : null,
        newCheckIn:      data.newCheckIn instanceof Timestamp ? data.newCheckIn.toDate() : new Date(data.newCheckIn as string),
        newCheckOut:     data.newCheckOut instanceof Timestamp ? data.newCheckOut.toDate() : new Date(data.newCheckOut as string),
        reason:          data.reason as string,
        correctedBy:     data.correctedBy as string,
        correctedByName: data.correctedByName as string | undefined,
        correctedAt:     data.correctedAt instanceof Timestamp ? data.correctedAt.toDate() : new Date(data.correctedAt as string),
      } as TimeLogCorrection
    })
    docs.sort((a, b) => b.correctedAt.getTime() - a.correctedAt.getTime())
    return docs[0]
  } catch (err) {
    console.error('[timeLogs] getTimeLogCorrection error:', err)
    return null
  }
}


