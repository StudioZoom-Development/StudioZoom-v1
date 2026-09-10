import {
  format,
  formatDistanceToNow,
  isToday,
  isTomorrow,
  isYesterday,
  parseISO,
  isValid,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  getDay,
  getDaysInMonth,
} from 'date-fns'

/** Format a Date to display string e.g. "22 Jul 2026" */
export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? parseISO(date) : date
  return format(d, 'd MMM yyyy')
}

/** Format ISO date string "YYYY-MM-DD" to "DD-MM-YYYY" for table displays */
export function formatDisplayDate(dateStr?: string, pattern = 'dd-MM-yyyy'): string {
  if (!dateStr) return '—'
  try {
    const d = parseISO(dateStr)
    return isValid(d) ? format(d, pattern) : dateStr
  } catch {
    return dateStr
  }
}

/** Format to month-year string e.g. "July 2026" */
export function formatMonthYear(date: Date): string {
  return format(date, 'MMMM yyyy')
}

/** Format to "YYYY-MM-DD" string (for staffAssignments.eventDate) */
export function toDateString(date: Date): string {
  return format(date, 'yyyy-MM-dd')
}

/** Format for time display e.g. "09:30 AM" */
export function formatTime(date: Date): string {
  return format(date, 'hh:mm a')
}

/** Format to full datetime e.g. "22 Jul 2026, 09:30 AM" */
export function formatDateTime(date: Date): string {
  return format(date, 'd MMM yyyy, hh:mm a')
}

/** Human-relative time e.g. "2 days ago" */
export function timeAgo(date: Date): string {
  return formatDistanceToNow(date, { addSuffix: true })
}

/** Smart label: "Today", "Tomorrow", "Yesterday", or formatted date */
export function smartDate(date: Date): string {
  if (isToday(date))     return 'Today'
  if (isTomorrow(date))  return 'Tomorrow'
  if (isYesterday(date)) return 'Yesterday'
  return formatDate(date)
}

/** Get all days in a given month for calendar grids */
export function getDaysInMonthGrid(year: number, month: number): Date[] {
  const start = startOfMonth(new Date(year, month - 1))
  const end   = endOfMonth(new Date(year, month - 1))
  return eachDayOfInterval({ start, end })
}

/** Returns 0=Sun … 6=Sat for a given date */
export function getDayOfWeek(date: Date): number {
  return getDay(date)
}

/** Number of days in a month */
export function getDaysCount(year: number, month: number): number {
  return getDaysInMonth(new Date(year, month - 1))
}

/** Parse an ISO date string safely */
export function parseDate(dateStr: string): Date {
  return parseISO(dateStr)
}

export interface RecurringSessionDate {
  sessionNumber: number
  label: string
  date: Date
  dateStr: string // "yyyy-MM-dd"
  displayDate: string // "11 Sep 2026"
  dayOfWeek: string // "Fri"
  startTime: string
  endTime: string
}

/** Compute all session dates for a recurring booking based on frequency, startDate, and totalSessions */
export function computeRecurringSessionDates(
  frequency: 'weekly' | 'biweekly' | 'monthly',
  startDate: Date | string,
  totalSessions: number,
  sessionStartTime: string = '09:00',
  sessionEndTime: string = '18:00'
): RecurringSessionDate[] {
  let start: Date
  if (startDate instanceof Date) {
    start = new Date(startDate.getTime())
  } else if (typeof startDate === 'string' && startDate) {
    const parts = startDate.split('-').map(Number)
    if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
      start = new Date(parts[0], parts[1] - 1, parts[2])
    } else {
      start = new Date(startDate)
    }
  } else {
    start = new Date()
  }

  if (isNaN(start.getTime())) return []
  const count = Math.max(1, Math.min(totalSessions || 1, 100))

  const sessions: RecurringSessionDate[] = []
  for (let i = 0; i < count; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate())
    if (frequency === 'weekly') {
      d.setDate(d.getDate() + (i * 7))
    } else if (frequency === 'biweekly') {
      d.setDate(d.getDate() + (i * 14))
    } else if (frequency === 'monthly') {
      d.setMonth(d.getMonth() + i)
    }

    sessions.push({
      sessionNumber: i + 1,
      label: `Session ${i + 1}`,
      date: d,
      dateStr: format(d, 'yyyy-MM-dd'),
      displayDate: format(d, 'd MMM yyyy'),
      dayOfWeek: format(d, 'EEE'),
      startTime: sessionStartTime,
      endTime: sessionEndTime,
    })
  }

  return sessions
}

