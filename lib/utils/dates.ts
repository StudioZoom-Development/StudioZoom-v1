import {
  format,
  formatDistanceToNow,
  isToday,
  isTomorrow,
  isYesterday,
  parseISO,
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
