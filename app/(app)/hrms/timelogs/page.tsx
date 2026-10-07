'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { format, parseISO, isValid } from 'date-fns'
import { useAuthStore } from '@/store/authStore'
import { useBackSwipe } from '@/hooks/useMobileGestures'
import { Badge } from '@/components/shared/Badge'
import { DateField } from '@/components/shared/DateField'
import { TimeField } from '@/components/shared/TimeField'
import { TableRowSkeleton } from '@/components/shared/LoadingSkeleton'
import { EmptyState } from '@/components/shared/EmptyState'
import {
  subscribeTimeLogsForDate,
  saveTimeLogCorrection,
  getTimeLogCorrection,
  getTodayDateString,
  formatTime12h,
  formatMinutes,
  STANDARD_MINUTES,
} from '@/lib/firebase/queries/timeLogs'
import {
  subscribeToStaffOnly,
  type StaffMember,
} from '@/lib/firebase/queries/staff'
import {
  subscribeToPendingLeaveRequests,
  approveLeaveRequest,
  rejectLeaveRequest,
} from '@/lib/firebase/queries/leaveRequests'
import type { TimeLog, LeaveRequest, TimeLogCorrection } from '@/types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function dateTo24h(d?: Date | null): string {
  if (!d || isNaN(d.getTime())) return ''
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

function time24hToDate(dateStr: string, time24: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number)
  const [hh, mm] = (time24 || '09:00').split(':').map(Number)
  return new Date(y, m - 1, d, hh || 0, mm || 0, 0)
}

function formatDateDisplay(dateStr: string): string {
  try {
    const d = parseISO(dateStr)
    return isValid(d) ? format(d, 'd MMM') : dateStr
  } catch {
    return dateStr
  }
}

interface ProcessedTimeLogRow {
  logId?: string
  staffUid: string
  staffName: string
  date: string
  firstLog?: TimeLog
  lastLog?: TimeLog
  checkInAt?: Date
  checkOutAt?: Date
  checkInDisplay: string
  checkOutDisplay: string
  isMissingCheckin: boolean
  isMissingCheckout: boolean
  isCorrected: boolean
  hoursDisplay: string
  workedMinutes: number
  varianceDisplay: string
  isNegativeVariance: boolean
  status: 'flagged' | 'clean' | 'corrected'
  reason?: string
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const SELECT_STYLE: React.CSSProperties = {
  fontFamily: 'var(--font-inter)',
  height: '38px',
  background: 'var(--color-surface-raised)',
  border: '0.5px solid var(--color-border)',
  borderRadius: '8px',
  padding: '0 12px',
  fontSize: 'var(--text-sm)',
  color: 'var(--color-foreground)',
  outline: 'none',
  cursor: 'pointer',
}

const TH_STYLE: React.CSSProperties = {
  fontSize: 'var(--text-xs)',
  fontWeight: 600,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  color: 'var(--color-foreground-subtle)',
  padding: '12px 16px',
  textAlign: 'left',
  borderBottom: '0.5px solid var(--color-border-strong)',
  background: 'var(--color-surface)',
}

const TD_STYLE: React.CSSProperties = {
  fontSize: 'var(--text-sm)',
  padding: '12px 16px',
  verticalAlign: 'middle',
  fontFamily: 'var(--font-inter)',
  color: 'var(--color-foreground)',
  borderBottom: '0.5px solid var(--color-border)',
}

// ─── Page Component ───────────────────────────────────────────────────────────

export default function TimeLogsPage() {
  const router = useRouter()
  const { backSwipeHandlers } = useBackSwipe(() => router.back())
  const appUser = useAuthStore(s => s.appUser)
  const role = appUser?.role ?? 'staff'
  const isAdminOrManager = role === 'admin' || role === 'manager'

  const searchParams = useSearchParams()
  const highlightId = searchParams.get('highlight')

  // Filter States
  const [selectedStaff, setSelectedStaff] = useState<string>('all')
  const [selectedStatus, setSelectedStatus] = useState<string>('all')
  const [selectedDate, setSelectedDate] = useState<string>(getTodayDateString())

  // Data States
  const [staffList, setStaffList] = useState<StaffMember[]>([])
  const [logs, setLogs] = useState<TimeLog[]>([])
  const [pendingLeaveRequests, setPendingLeaveRequests] = useState<LeaveRequest[]>([])
  const [loading, setLoading] = useState(true)

  // Scroll to highlighted leave request if provided in query params
  useEffect(() => {
    if (highlightId && pendingLeaveRequests.length > 0) {
      const timer = setTimeout(() => {
        const el = document.getElementById(`leave-req-${highlightId}`)
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }
      }, 250)
      return () => clearTimeout(timer)
    }
  }, [highlightId, pendingLeaveRequests])

  // Modals
  const [fixTarget, setFixTarget] = useState<ProcessedTimeLogRow | null>(null)
  const [viewTarget, setViewTarget] = useState<ProcessedTimeLogRow | null>(null)
  const [activeCorrection, setActiveCorrection] = useState<TimeLogCorrection | null>(null)

  // Fix Modal form
  const [fixCheckIn, setFixCheckIn] = useState('09:00')
  const [fixCheckOut, setFixCheckOut] = useState('20:00')
  const [fixReason, setFixReason] = useState('')
  const [fixError, setFixError] = useState('')
  const [savingFix, setSavingFix] = useState(false)

  // View Modal form (editable for admin/manager)
  const [viewCheckIn, setViewCheckIn] = useState('09:00')
  const [viewCheckOut, setViewCheckOut] = useState('20:00')
  const [viewReason, setViewReason] = useState('')
  const [viewChanged, setViewChanged] = useState(false)
  const [savingView, setSavingView] = useState(false)

  // Subscribe to Staff (Admin/Manager sees active staff, Staff sees self)
  useEffect(() => {
    const unsub = subscribeToStaffOnly(list => {
      setStaffList(list.filter(s => s.isActive !== false))
    })
    return () => unsub()
  }, [])

  // Staff lookup map
  const staffMap = useMemo(() => {
    const map = new Map<string, StaffMember>()
    for (const s of staffList) {
      map.set(s.uid, s)
    }
    return map
  }, [staffList])

  // Real-time time logs for selected date (scoped to role)
  useEffect(() => {
    const effectiveStaffUid = isAdminOrManager
      ? (selectedStaff === 'all' ? undefined : selectedStaff)
      : appUser?.uid

    const unsub = subscribeTimeLogsForDate(selectedDate, effectiveStaffUid, dateLogs => {
      setLogs(dateLogs)
      setLoading(false)
    })
    return () => unsub()
  }, [selectedDate, selectedStaff, isAdminOrManager, appUser?.uid])

  // Subscribe to pending leave requests (Admin/Manager only)
  useEffect(() => {
    if (!isAdminOrManager) return
    const unsub = subscribeToPendingLeaveRequests(reqs => {
      setPendingLeaveRequests(reqs)
    })
    return () => unsub()
  }, [isAdminOrManager])

  // Group current date logs by staffUid
  const logsByStaff = useMemo(() => {
    const map = new Map<string, TimeLog[]>()
    for (const log of logs) {
      const list = map.get(log.staffUid) || []
      list.push(log)
      map.set(log.staffUid, list)
    }
    return map
  }, [logs])

  // Process rows for Grid
  const processedRows = useMemo<ProcessedTimeLogRow[]>(() => {
    const rows: ProcessedTimeLogRow[] = []
    const todayStr = getTodayDateString()
    const isPastDate = selectedDate < todayStr
    const isToday = selectedDate === todayStr

    const now = new Date()
    const currentMinutes = now.getHours() * 60 + now.getMinutes()
    const isPast930Am = isPastDate || (isToday && currentMinutes > 570)

    // Determine candidate staff UIDs to display
    let candidateUids: string[] = []
    if (isAdminOrManager) {
      if (selectedStaff !== 'all') {
        candidateUids = [selectedStaff]
      } else {
        // Show all active staff members even if no time log is recorded
        const allStaffUids = staffList.map(s => s.uid)
        const uidsWithLogs = Array.from(logsByStaff.keys())
        candidateUids = Array.from(new Set([...allStaffUids, ...uidsWithLogs]))
        candidateUids.sort((a, b) => {
          const nameA = staffMap.get(a)?.name || ''
          const nameB = staffMap.get(b)?.name || ''
          return nameA.localeCompare(nameB)
        })
      }
    } else {
      // Staff view: only self
      if (appUser?.uid) {
        candidateUids = [appUser.uid]
      }
    }

    for (const uid of candidateUids) {
      const staffMember = staffMap.get(uid)
      const staffName = staffMember?.name || (uid === appUser?.uid ? appUser?.name : 'Staff Member') || 'Staff'
      const staffLogs = logsByStaff.get(uid) || []

      // Earliest check-in and latest check-out
      const firstLog = staffLogs.length > 0 ? staffLogs[0] : undefined
      const lastLog = staffLogs.length > 0 ? staffLogs[staffLogs.length - 1] : undefined
      const isCorrected = staffLogs.some(l => l.isCorrected || l.status === 'corrected')

      const checkInAt = firstLog?.checkInAt
      const checkOutAt = lastLog?.checkOutAt

      // Check-in: if time goes beyond 9:30 AM and no check-in exists, show Missing
      let checkInDisplay = '—'
      let isMissingCheckin = false

      if (checkInAt) {
        checkInDisplay = formatTime12h(checkInAt)
      } else {
        if (isPast930Am) {
          checkInDisplay = 'Missing'
          isMissingCheckin = true
        } else {
          checkInDisplay = '—'
        }
      }

      // Check-out: missing in check-out shows when day is over (e.g. night 12:00 AM of next day / past date)
      let checkOutDisplay = '—'
      let isMissingCheckout = false

      if (checkOutAt) {
        checkOutDisplay = `${formatTime12h(checkOutAt)}${isCorrected ? ' (fixed)' : ''}`
      } else {
        if (isPastDate) {
          checkOutDisplay = 'Missing'
          isMissingCheckout = true
        } else if (isToday) {
          if (checkInAt) {
            checkOutDisplay = 'In Progress'
          } else {
            checkOutDisplay = '—'
          }
        } else {
          checkOutDisplay = '—'
        }
      }

      // Compute total minutes
      const closedMinutes = staffLogs
        .filter(l => l.checkOutAt && l.workedMinutes != null)
        .reduce((sum, l) => sum + (l.workedMinutes ?? 0), 0)

      const totalMinutes = isMissingCheckout || isMissingCheckin ? 0 : closedMinutes
      const hoursDisplay = isMissingCheckout || isMissingCheckin || totalMinutes === 0 ? '—' : formatMinutes(totalMinutes)

      // Variance calculation: 9 hrs (540 mins) - Hours worked
      const diff = totalMinutes - STANDARD_MINUTES
      let varianceDisplay = '—'
      let isNegativeVariance = false

      if (!isMissingCheckout && !isMissingCheckin && totalMinutes > 0) {
        if (diff < 0) {
          varianceDisplay = `-${formatMinutes(Math.abs(diff))}`
          isNegativeVariance = true
        } else {
          varianceDisplay = `+${formatMinutes(diff)}`
        }
      }

      // Status auto-calculation
      let status: 'flagged' | 'clean' | 'corrected' = 'clean'
      if (isCorrected) {
        status = 'corrected'
      } else if (isMissingCheckin || isMissingCheckout || (totalMinutes > 0 && diff < -30)) {
        status = 'flagged'
      } else {
        status = 'clean'
      }

      // Apply Status filter (if set by Admin/Manager)
      if (selectedStatus !== 'all' && status !== selectedStatus.toLowerCase()) {
        continue
      }

      rows.push({
        logId: lastLog?.logId || firstLog?.logId,
        staffUid: uid,
        staffName,
        date: selectedDate,
        firstLog,
        lastLog,
        checkInAt,
        checkOutAt,
        checkInDisplay,
        checkOutDisplay,
        isMissingCheckin,
        isMissingCheckout,
        isCorrected,
        hoursDisplay,
        workedMinutes: totalMinutes,
        varianceDisplay,
        isNegativeVariance,
        status,
        reason: lastLog?.correctionReason || firstLog?.correctionReason,
      })
    }

    return rows
  }, [logsByStaff, isAdminOrManager, selectedStaff, selectedDate, selectedStatus, staffMap, staffList, appUser])

  // Count flagged logs for the top-right indicator
  // Evaluates flagged logs across the active scope (or week/day)
  const flaggedCount = useMemo(() => {
    // Check logs visible in current processed table or all logs for current date
    const countInGrid = processedRows.filter(r => r.status === 'flagged').length
    return countInGrid
  }, [processedRows])

  // ─── Modal Openers ──────────────────────────────────────────────────────────

  const handleOpenFix = (row: ProcessedTimeLogRow) => {
    setFixTarget(row)
    setFixCheckIn(dateTo24h(row.checkInAt) || '09:00')
    setFixCheckOut(dateTo24h(row.checkOutAt) || '20:00')
    setFixReason('')
    setFixError('')
  }

  const handleOpenView = async (row: ProcessedTimeLogRow) => {
    setViewTarget(row)
    setViewCheckIn(dateTo24h(row.checkInAt) || '09:00')
    setViewCheckOut(dateTo24h(row.checkOutAt) || '20:00')
    setViewReason(row.reason || '')
    setViewChanged(false)

    if (row.logId) {
      const corr = await getTimeLogCorrection(row.logId)
      setActiveCorrection(corr)
      if (corr) {
        setViewCheckIn(dateTo24h(corr.newCheckIn))
        setViewCheckOut(dateTo24h(corr.newCheckOut))
        setViewReason(corr.reason)
      }
    }
  }

  // ─── Save Fix ───────────────────────────────────────────────────────────────

  const handleSaveFix = async () => {
    if (!fixTarget) return
    if (!fixReason.trim()) {
      setFixError('Reason is mandatory. Please provide an explanation for fixing this log.')
      return
    }

    setSavingFix(true)
    setFixError('')

    try {
      const newIn = time24hToDate(fixTarget.date, fixCheckIn)
      const newOut = time24hToDate(fixTarget.date, fixCheckOut)

      await saveTimeLogCorrection({
        logId: fixTarget.logId,
        staffUid: fixTarget.staffUid,
        date: fixTarget.date,
        oldCheckIn: fixTarget.checkInAt || null,
        oldCheckOut: fixTarget.checkOutAt || null,
        newCheckIn: newIn,
        newCheckOut: newOut,
        reason: fixReason.trim(),
        correctedByUid: appUser?.uid || 'admin',
        correctedByName: appUser?.name || 'Admin',
      })

      setFixTarget(null)
    } catch (err) {
      setFixError(err instanceof Error ? err.message : 'Failed to save correction.')
    } finally {
      setSavingFix(false)
    }
  }

  // ─── Save View Edits (Admin/Manager only) ────────────────────────────────────

  const handleSaveView = async () => {
    if (!viewTarget || !isAdminOrManager) return
    if (!viewReason.trim()) return

    setSavingView(true)
    try {
      const newIn = time24hToDate(viewTarget.date, viewCheckIn)
      const newOut = time24hToDate(viewTarget.date, viewCheckOut)

      await saveTimeLogCorrection({
        logId: viewTarget.logId,
        staffUid: viewTarget.staffUid,
        date: viewTarget.date,
        oldCheckIn: viewTarget.checkInAt || null,
        oldCheckOut: viewTarget.checkOutAt || null,
        newCheckIn: newIn,
        newCheckOut: newOut,
        reason: viewReason.trim(),
        correctedByUid: appUser?.uid || 'admin',
        correctedByName: appUser?.name || 'Admin',
      })

      setViewTarget(null)
    } catch (err) {
      console.error('Failed to update correction:', err)
    } finally {
      setSavingView(false)
    }
  }

  // ─── Leave Request Actions ──────────────────────────────────────────────────

  const handleAcceptLeave = useCallback(async (req: LeaveRequest) => {
    if (!appUser) return
    try {
      await approveLeaveRequest(req.requestId, req.staffUid, req.date, appUser.uid)
    } catch (err) {
      console.error('Failed to approve leave request:', err)
    }
  }, [appUser])

  const handleRejectLeave = useCallback(async (req: LeaveRequest) => {
    if (!appUser) return
    try {
      await rejectLeaveRequest(req.requestId, req.staffUid, req.date, appUser.uid)
    } catch (err) {
      console.error('Failed to reject leave request:', err)
    }
  }, [appUser])

  return (
    <div
      className="p-3.5 sm:p-6 md:p-6 w-full max-w-[1280px] mx-auto flex flex-col gap-4 sm:gap-5"
      style={{
        fontFamily: 'var(--font-inter)',
        color: 'var(--color-foreground)',
      }}
    >

      {/* ── Page Title Header ────────────────────────────────────────────── */}
      {/* <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{
            fontSize: 'var(--text-2xl)',
            fontWeight: 700,
            letterSpacing: '-0.02em',
            margin: 0,
            color: 'var(--color-foreground)',
          }}>
            Time Log Review
          </h1>
        </div>
      </div> */}

      {/* ── Desktop View (Strict Invariance) ── */}
      <div className="hidden md:flex md:flex-col gap-5">
        {/* ── Filters & Flagged Indicator Bar ───────────────────────────────── */}
        <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px',
      }}>
        {/* Left: Filter Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          {/* Staff Filter (Admin/Manager only) */}
          {isAdminOrManager && (
            <select
              id="timelogs-staff-select"
              value={selectedStaff}
              onChange={e => setSelectedStaff(e.target.value)}
              style={SELECT_STYLE}
            >
              <option value="all">Staff · All</option>
              {staffList.map(s => (
                <option key={s.uid} value={s.uid}>
                  {s.name}
                </option>
              ))}
            </select>
          )}

          {/* Status Filter (Admin/Manager only) */}
          {isAdminOrManager && (
            <select
              id="timelogs-status-select"
              value={selectedStatus}
              onChange={e => setSelectedStatus(e.target.value)}
              style={SELECT_STYLE}
            >
              <option value="all">Status · All</option>
              <option value="flagged">Flagged</option>
              <option value="corrected">Corrected</option>
              <option value="clean">Clean</option>
            </select>
          )}

          {/* Date Picker (Click anywhere opens calendar) */}
          <div style={{ width: '150px' }}>
            <DateField
              value={selectedDate}
              onChange={setSelectedDate}
              placeholder="MM/DD/YYYY"
            />
          </div>
        </div>

        {/* Right: Flagged Indicator (Only renders if flaggedCount > 0) */}
        {flaggedCount > 0 && (
          <div
            id="timelogs-flagged-indicator"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 14px',
              borderRadius: '20px',
              background: 'var(--color-secondary-muted)',
              color: 'var(--color-secondary)',
              border: '0.5px solid var(--color-secondary)',
              fontSize: 'var(--text-xs)',
              fontWeight: 600,
              letterSpacing: '0.02em',
            }}
          >
            <i className="ti ti-alert-triangle" style={{ fontSize: '14px' }} />
            <span>{flaggedCount} {flaggedCount === 1 ? 'flagged log' : 'flagged logs'}</span>
          </div>
        )}
      </div>

      {/* ── Time Logs Grid Table ─────────────────────────────────────────── */}
      <div style={{
        background: 'var(--color-surface)',
        border: '0.5px solid var(--color-border)',
        borderRadius: '12px',
        overflow: 'hidden',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
      }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ ...TH_STYLE, width: '180px' }}>Staff</th>
                <th style={{ ...TH_STYLE, width: '100px' }}>Date</th>
                <th style={{ ...TH_STYLE, width: '120px' }}>Check-in</th>
                <th style={{ ...TH_STYLE, width: '140px' }}>Check-out</th>
                <th style={{ ...TH_STYLE, width: '100px' }}>Hours</th>
                <th style={{ ...TH_STYLE, width: '100px' }}>Variance</th>
                <th style={{ ...TH_STYLE, width: '110px' }}>Status</th>
                <th style={{ ...TH_STYLE, width: '90px', textAlign: 'right' }}></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <TableRowSkeleton rows={3} cols={8} />
              ) : processedRows.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: '40px 16px', textAlign: 'center' }}>
                    <EmptyState
                      icon="ti-history"
                      title="No time logs found"
                      description="There are no time log records for the selected date and filters."
                    />
                  </td>
                </tr>
              ) : (
                processedRows.map(row => {
                  const isFlagged = row.status === 'flagged'

                  return (
                    <tr
                      key={`${row.staffUid}_${row.date}`}
                      style={{
                        background: 'transparent',
                        borderLeft: isFlagged ? '3px solid var(--color-secondary)' : '3px solid transparent',
                        transition: 'background 0.12s',
                      }}
                    >
                      {/* Staff */}
                      <td style={{ ...TD_STYLE, fontWeight: 600 }}>
                        {row.staffName}
                      </td>

                      {/* Date */}
                      <td style={{ ...TD_STYLE, color: 'var(--color-foreground-muted)' }}>
                        {formatDateDisplay(row.date)}
                      </td>

                      {/* Check-in */}
                      <td style={TD_STYLE}>
                        {row.isMissingCheckin ? (
                          <span style={{ color: 'var(--color-danger)', fontWeight: 600 }}>
                            Missing
                          </span>
                        ) : (
                          <span>{row.checkInDisplay}</span>
                        )}
                      </td>

                      {/* Check-out */}
                      <td style={TD_STYLE}>
                        {row.isMissingCheckout ? (
                          <span style={{ color: 'var(--color-danger)', fontWeight: 600 }}>
                            Missing
                          </span>
                        ) : (
                          <span>{row.checkOutDisplay}</span>
                        )}
                      </td>

                      {/* Hours */}
                      <td style={{ ...TD_STYLE, color: row.hoursDisplay === '—' ? 'var(--color-foreground-subtle)' : 'var(--color-foreground)' }}>
                        {row.hoursDisplay}
                      </td>

                      {/* Variance */}
                      <td style={{
                        ...TD_STYLE,
                        fontWeight: 600,
                        color: row.isNegativeVariance
                          ? 'var(--color-secondary)'
                          : row.varianceDisplay === '—'
                            ? 'var(--color-foreground-subtle)'
                            : 'var(--color-foreground-muted)',
                      }}>
                        {row.varianceDisplay}
                      </td>

                      {/* Status */}
                      <td style={TD_STYLE}>
                        <Badge variant={row.status} />
                      </td>

                      {/* Action */}
                      <td style={{ ...TD_STYLE, textAlign: 'right' }}>
                        {isFlagged && isAdminOrManager && (
                          <button
                            id={`fix-btn-${row.staffUid}`}
                            onClick={() => handleOpenFix(row)}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: 'var(--color-secondary)',
                              fontWeight: 600,
                              fontSize: 'var(--text-sm)',
                              fontFamily: 'var(--font-inter)',
                              cursor: 'pointer',
                              padding: '4px 8px',
                            }}
                          >
                            Fix
                          </button>
                        )}

                        {row.status === 'corrected' && (
                          <button
                            id={`view-btn-${row.staffUid}`}
                            onClick={() => handleOpenView(row)}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: 'var(--color-accent)',
                              fontWeight: 600,
                              fontSize: 'var(--text-sm)',
                              fontFamily: 'var(--font-inter)',
                              cursor: 'pointer',
                              padding: '4px 8px',
                            }}
                          >
                            View
                          </button>
                        )}

                        {row.status === 'clean' && (
                          <button
                            id={`view-btn-${row.staffUid}`}
                            onClick={() => handleOpenView(row)}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: 'var(--color-accent)',
                              fontWeight: 600,
                              fontSize: 'var(--text-sm)',
                              fontFamily: 'var(--font-inter)',
                              cursor: 'pointer',
                              padding: '4px 8px',
                            }}
                          >
                            View
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Info Line (Directly Below the Grid) ─────────────────────────── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        background: 'var(--color-surface)',
        border: '0.5px solid var(--color-border)',
        borderRadius: '10px',
        padding: '12px 16px',
        color: 'var(--color-foreground-muted)',
        fontSize: 'var(--text-sm)',
      }}>
        <i className="ti ti-info-circle" style={{ color: 'var(--color-accent)', fontSize: '18px', flexShrink: 0 }} />
        <span>Fixing a flagged log requires a reason — it&apos;s stored on the log and visible to the staff member.</span>
      </div>

      {/* ── Leave Requests Grid (Admin, Manager Only) ────────────────────── */}
      {isAdminOrManager && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h2 style={{
              fontSize: 'var(--text-lg)',
              fontWeight: 600,
              margin: 0,
              color: 'var(--color-foreground)',
            }}>
              Leave Requests
            </h2>
            {pendingLeaveRequests.length > 0 && (
              <span style={{
                fontSize: 'var(--text-xs)',
                fontWeight: 600,
                padding: '2px 8px',
                borderRadius: '10px',
                background: 'var(--color-secondary-muted)',
                color: 'var(--color-secondary)',
              }}>
                {pendingLeaveRequests.length} pending
              </span>
            )}
          </div>

          <div style={{
            background: 'var(--color-surface)',
            border: '0.5px solid var(--color-border)',
            borderRadius: '12px',
            overflow: 'hidden',
          }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ ...TH_STYLE, width: '220px' }}>Staff</th>
                    <th style={{ ...TH_STYLE, width: '160px' }}>Leave Applied On</th>
                    <th style={TH_STYLE}>Reason for Leave</th>
                    <th style={{ ...TH_STYLE, width: '180px', textAlign: 'right' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingLeaveRequests.length === 0 ? (
                    <tr>
                      <td colSpan={4} style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--color-foreground-muted)', fontSize: 'var(--text-sm)' }}>
                        No pending leave requests to review.
                      </td>
                    </tr>
                  ) : (
                    pendingLeaveRequests.map(req => {
                      const staff = staffMap.get(req.staffUid)
                      const staffName = staff?.name || 'Staff'
                      const isHighlighted = highlightId === req.requestId

                      return (
                        <tr
                          key={req.requestId}
                          id={`leave-req-${req.requestId}`}
                          style={{
                            borderBottom: '0.5px solid var(--color-border)',
                            background: isHighlighted ? 'var(--color-primary-muted)' : undefined,
                            transition: 'background 0.3s ease',
                          }}
                        >
                          {/* Staff */}
                          <td style={{ ...TD_STYLE, fontWeight: 600 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span>{staffName}</span>
                              {isHighlighted && (
                                <span
                                  style={{
                                    fontSize: '10px',
                                    fontWeight: 700,
                                    padding: '1px 6px',
                                    borderRadius: '4px',
                                    background: 'var(--color-primary)',
                                    color: '#ffffff',
                                    letterSpacing: '0.02em',
                                    textTransform: 'uppercase',
                                  }}
                                >
                                  Selected
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Applied On */}
                          <td style={{ ...TD_STYLE, color: 'var(--color-foreground-muted)' }}>
                            {formatDateDisplay(req.date)}
                          </td>

                          {/* Reason */}
                          <td style={TD_STYLE}>
                            {req.reason || <span style={{ color: 'var(--color-foreground-subtle)' }}>No reason provided</span>}
                          </td>

                          {/* Actions */}
                          <td style={{ ...TD_STYLE, textAlign: 'right' }}>
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                              <button
                                id={`accept-leave-${req.requestId}`}
                                onClick={() => handleAcceptLeave(req)}
                                style={{
                                  background: 'var(--color-success-muted)',
                                  color: 'var(--color-success)',
                                  border: '0.5px solid var(--color-success)',
                                  borderRadius: '6px',
                                  padding: '5px 12px',
                                  fontSize: 'var(--text-xs)',
                                  fontWeight: 600,
                                  fontFamily: 'var(--font-inter)',
                                  cursor: 'pointer',
                                }}
                              >
                                Accept
                              </button>
                              <button
                                id={`reject-leave-${req.requestId}`}
                                onClick={() => handleRejectLeave(req)}
                                style={{
                                  background: 'var(--color-danger-muted)',
                                  color: 'var(--color-danger)',
                                  border: '0.5px solid var(--color-danger)',
                                  borderRadius: '6px',
                                  padding: '5px 12px',
                                  fontSize: 'var(--text-xs)',
                                  fontWeight: 600,
                                  fontFamily: 'var(--font-inter)',
                                  cursor: 'pointer',
                                }}
                              >
                                Reject
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
      </div>

      {/* ── Mobile View (Compact Cards & Touch Gestures) ── */}
      <div className="flex flex-col md:hidden gap-3.5 pb-24" {...backSwipeHandlers}>
        {/* Date Selector Header Card */}
        <div
          style={{
            background: 'var(--color-surface)',
            border: '0.5px solid var(--color-border)',
            borderRadius: '14px',
            padding: '12px 14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '10px',
            boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                color: 'var(--color-foreground-subtle)',
              }}
            >
              Time Log Review
            </span>
            <span
              style={{
                fontSize: 'var(--text-sm)',
                fontWeight: 700,
                color: 'var(--color-foreground)',
                marginTop: '1px',
              }}
            >
              {formatDateDisplay(selectedDate)}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {selectedDate !== getTodayDateString() && (
              <button
                type="button"
                onClick={() => setSelectedDate(getTodayDateString())}
                style={{
                  height: '32px',
                  padding: '0 10px',
                  borderRadius: '16px',
                  background: 'var(--color-primary-muted)',
                  border: '0.5px solid var(--color-primary)',
                  color: 'var(--color-primary)',
                  fontSize: 'var(--text-xs)',
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: 'var(--font-inter)',
                  whiteSpace: 'nowrap',
                }}
              >
                Today
              </button>
            )}
            <div style={{ width: '130px' }}>
              <DateField
                value={selectedDate}
                onChange={setSelectedDate}
                placeholder="MM/DD/YYYY"
              />
            </div>
          </div>
        </div>

        {/* Staff Filter (Admin/Manager only) */}
        {isAdminOrManager && (
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <select
              value={selectedStaff}
              onChange={e => setSelectedStaff(e.target.value)}
              style={{ ...SELECT_STYLE, width: '100%', height: '36px' }}
            >
              <option value="all">Staff · All Members</option>
              {staffList.map(s => (
                <option key={s.uid} value={s.uid}>{s.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Quick Status Filter Chips */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            overflowX: 'auto',
            scrollbarWidth: 'none',
            WebkitOverflowScrolling: 'touch',
            padding: '2px 0',
          }}
        >
          {[
            { id: 'all', label: `All` },
            { id: 'flagged', label: `Flagged (${flaggedCount})` },
            { id: 'corrected', label: `Corrected` },
            { id: 'clean', label: `Clean` },
          ].map(tab => {
            const active = selectedStatus === tab.id
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSelectedStatus(tab.id)}
                style={{
                  height: '32px',
                  padding: '0 12px',
                  borderRadius: '16px',
                  fontSize: 'var(--text-xs)',
                  fontWeight: 600,
                  fontFamily: 'var(--font-inter)',
                  whiteSpace: 'nowrap',
                  border: active ? '0.5px solid var(--color-primary)' : '0.5px solid var(--color-border)',
                  background: active ? 'var(--color-primary-muted)' : 'var(--color-surface)',
                  color: active ? 'var(--color-primary)' : 'var(--color-foreground-muted)',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  flexShrink: 0,
                }}
              >
                {tab.label}
              </button>
            )
          })}
        </div>

        {/* Flagged Review Alert Banner */}
        {flaggedCount > 0 && selectedStatus !== 'flagged' && (
          <div
            onClick={() => setSelectedStatus('flagged')}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '8px',
              padding: '10px 14px',
              borderRadius: '10px',
              background: 'var(--color-secondary-muted)',
              border: '0.5px solid var(--color-secondary)',
              color: 'var(--color-secondary)',
              fontSize: 'var(--text-xs)',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <i className="ti ti-alert-triangle" style={{ fontSize: '16px' }} />
              <span>{flaggedCount} {flaggedCount === 1 ? 'log requires review' : 'logs require review'}</span>
            </div>
            <span style={{ fontSize: '11px', textDecoration: 'underline' }}>Show flagged &gt;</span>
          </div>
        )}

        {/* Mobile Log Cards List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {[1, 2, 3].map(i => (
                <div key={i} style={{
                  height: '140px',
                  background: 'var(--color-surface)',
                  borderRadius: '12px',
                  border: '0.5px solid var(--color-border)',
                }} />
              ))}
            </div>
          ) : processedRows.length === 0 ? (
            <div style={{
              background: 'var(--color-surface)',
              borderRadius: '12px',
              border: '0.5px solid var(--color-border)',
              padding: '32px 16px',
            }}>
              <EmptyState
                icon="ti-history"
                title="No time logs found"
                description="There are no time logs for the selected date and filters."
              />
            </div>
          ) : (
            processedRows.map(row => {
              const isFlagged = row.status === 'flagged'

              return (
                <div
                  key={`${row.staffUid}_${row.date}`}
                  style={{
                    background: 'var(--color-surface)',
                    border: '0.5px solid var(--color-border)',
                    borderLeft: isFlagged ? '3px solid var(--color-secondary)' : row.status === 'corrected' ? '3px solid var(--color-accent)' : '0.5px solid var(--color-border)',
                    borderRadius: '12px',
                    padding: '14px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                  }}
                >
                  {/* Card Header: Staff and Status */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                      <div style={{
                        width: '30px',
                        height: '30px',
                        borderRadius: '50%',
                        background: 'var(--color-primary-muted)',
                        color: 'var(--color-primary)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '11px',
                        fontWeight: 700,
                        flexShrink: 0,
                      }}>
                        {row.staffName.slice(0, 2).toUpperCase()}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)', color: 'var(--color-foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {row.staffName}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--color-foreground-muted)' }}>
                          {formatDateDisplay(row.date)}
                        </div>
                      </div>
                    </div>
                    <Badge variant={row.status} />
                  </div>

                  {/* Times Grid */}
                  <div style={{
                    background: 'var(--color-surface-raised)',
                    borderRadius: '8px',
                    padding: '10px 12px',
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '8px',
                    fontSize: 'var(--text-xs)',
                  }}>
                    <div>
                      <span style={{ color: 'var(--color-foreground-subtle)', display: 'block', marginBottom: '2px', textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: '10px' }}>Check-in</span>
                      {row.isMissingCheckin ? (
                        <span style={{ color: 'var(--color-danger)', fontWeight: 700 }}>Missing</span>
                      ) : (
                        <span style={{ color: 'var(--color-foreground)', fontWeight: 600 }}>{row.checkInDisplay}</span>
                      )}
                    </div>
                    <div>
                      <span style={{ color: 'var(--color-foreground-subtle)', display: 'block', marginBottom: '2px', textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: '10px' }}>Check-out</span>
                      {row.isMissingCheckout ? (
                        <span style={{ color: 'var(--color-danger)', fontWeight: 700 }}>Missing</span>
                      ) : (
                        <span style={{ color: 'var(--color-foreground)', fontWeight: 600 }}>{row.checkOutDisplay}</span>
                      )}
                    </div>
                    <div style={{ borderTop: '0.5px solid var(--color-border)', paddingTop: '6px' }}>
                      <span style={{ color: 'var(--color-foreground-subtle)', display: 'block', marginBottom: '2px', textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: '10px' }}>Hours</span>
                      <span style={{ color: 'var(--color-foreground)', fontWeight: 600 }}>{row.hoursDisplay}</span>
                    </div>
                    <div style={{ borderTop: '0.5px solid var(--color-border)', paddingTop: '6px' }}>
                      <span style={{ color: 'var(--color-foreground-subtle)', display: 'block', marginBottom: '2px', textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: '10px' }}>Variance</span>
                      <span style={{
                        fontWeight: 600,
                        color: row.isNegativeVariance ? 'var(--color-secondary)' : 'var(--color-foreground-muted)',
                      }}>
                        {row.varianceDisplay}
                      </span>
                    </div>
                  </div>

                  {/* Reason snippet if present */}
                  {row.reason && (
                    <div style={{
                      fontSize: 'var(--text-xs)',
                      color: 'var(--color-foreground-muted)',
                      background: 'var(--color-surface-raised)',
                      borderLeft: '2.5px solid var(--color-accent)',
                      padding: '6px 10px',
                      borderRadius: '4px',
                    }}>
                      &ldquo;{row.reason}&rdquo;
                    </div>
                  )}

                  {/* Actions Footer */}
                  {isFlagged && isAdminOrManager ? (
                    <button
                      onClick={() => handleOpenFix(row)}
                      style={{
                        width: '100%',
                        height: '40px',
                        borderRadius: '8px',
                        background: 'var(--color-secondary-muted)',
                        border: '0.5px solid var(--color-secondary)',
                        color: 'var(--color-secondary)',
                        fontSize: 'var(--text-xs)',
                        fontWeight: 600,
                        fontFamily: 'var(--font-inter)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                      }}
                    >
                      <i className="ti ti-tool" style={{ fontSize: '14px' }} />
                      Fix Flagged Time Log
                    </button>
                  ) : (
                    <button
                      onClick={() => handleOpenView(row)}
                      style={{
                        width: '100%',
                        height: '40px',
                        borderRadius: '8px',
                        background: 'transparent',
                        border: '0.5px solid var(--color-border)',
                        color: 'var(--color-accent)',
                        fontSize: 'var(--text-xs)',
                        fontWeight: 600,
                        fontFamily: 'var(--font-inter)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                      }}
                    >
                      <i className="ti ti-eye" style={{ fontSize: '14px' }} />
                      View Log Details
                    </button>
                  )}
                </div>
              )
            })
          )}
        </div>

        {/* Mobile Pending Leave Requests */}
        {isAdminOrManager && pendingLeaveRequests.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-foreground)' }}>
                Pending Leave Requests
              </span>
              <span style={{
                fontSize: 'var(--text-xs)',
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: '12px',
                background: 'var(--color-secondary-muted)',
                color: 'var(--color-secondary)',
              }}>
                {pendingLeaveRequests.length}
              </span>
            </div>

            {pendingLeaveRequests.map(req => {
              const staff = staffMap.get(req.staffUid)
              const staffName = staff?.name || 'Staff'

              return (
                <div
                  key={req.requestId}
                  style={{
                    background: 'var(--color-surface)',
                    border: '0.5px solid var(--color-border)',
                    borderRadius: '12px',
                    padding: '14px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 600, fontSize: 'var(--text-sm)', color: 'var(--color-foreground)' }}>
                      {staffName}
                    </span>
                    <Badge variant="inquiry" label={req.type} />
                  </div>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-muted)' }}>
                    {formatDateDisplay(req.date)} {req.reason && `· ${req.reason}`}
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      onClick={() => handleAcceptLeave(req)}
                      style={{
                        flex: 1,
                        height: '40px',
                        borderRadius: '8px',
                        background: 'var(--color-success)',
                        color: '#ffffff',
                        border: 'none',
                        fontSize: 'var(--text-xs)',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      Accept
                    </button>
                    <button
                      onClick={() => handleRejectLeave(req)}
                      style={{
                        flex: 1,
                        height: '40px',
                        borderRadius: '8px',
                        background: 'var(--color-danger-muted)',
                        color: 'var(--color-danger)',
                        border: '0.5px solid var(--color-danger)',
                        fontSize: 'var(--text-xs)',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      Reject
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Fix Popup Modal (Admin/Manager only) ─────────────────────────── */}
      {fixTarget && (
        <div
          onClick={() => setFixTarget(null)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9995,
            background: 'rgba(0,0,0,0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            className="w-full max-w-[calc(100vw-24px)] md:w-[420px] md:max-w-[420px] max-h-[90dvh] overflow-y-auto"
            style={{
              background: 'var(--color-surface-overlay)',
              border: '0.5px solid var(--color-border)',
              borderRadius: '16px',
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
              fontFamily: 'var(--font-inter)',
              boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <h3 style={{ fontSize: 'var(--text-lg)', fontWeight: 600, margin: 0, color: 'var(--color-foreground)' }}>
                  Fix Flagged Log
                </h3>
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-muted)' }}>
                  {fixTarget.staffName} · {formatDateDisplay(fixTarget.date)}
                </span>
              </div>
              <button
                onClick={() => setFixTarget(null)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--color-foreground-muted)',
                  padding: '4px',
                }}
              >
                <i className="ti ti-x" style={{ fontSize: '18px' }} />
              </button>
            </div>

            {/* Check-in */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{
                fontSize: 'var(--text-xs)',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                color: 'var(--color-foreground-subtle)',
              }}>
                Check-in
              </label>
              <TimeField
                value={fixCheckIn}
                onChange={setFixCheckIn}
              />
            </div>

            {/* Check-out */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{
                fontSize: 'var(--text-xs)',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                color: 'var(--color-foreground-subtle)',
              }}>
                Check-out
              </label>
              <TimeField
                value={fixCheckOut}
                onChange={setFixCheckOut}
              />
            </div>

            {/* Reason (Mandatory) */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{
                fontSize: 'var(--text-xs)',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                color: 'var(--color-foreground-subtle)',
              }}>
                Reason <span style={{ color: 'var(--color-danger)' }}>*</span>
              </label>
              <textarea
                id="fix-reason-textarea"
                value={fixReason}
                onChange={e => {
                  setFixReason(e.target.value)
                  if (fixError) setFixError('')
                }}
                placeholder="Reason for correction (mandatory)..."
                rows={3}
                style={{
                  fontFamily: 'var(--font-inter)',
                  background: 'var(--color-surface-raised)',
                  border: fixError ? '1px solid var(--color-danger)' : '0.5px solid var(--color-border)',
                  borderRadius: '8px',
                  padding: '8px 10px',
                  fontSize: 'var(--text-sm)',
                  color: 'var(--color-foreground)',
                  outline: 'none',
                  resize: 'none',
                }}
              />
            </div>

            {/* Error Message */}
            {fixError && (
              <div style={{
                fontSize: 'var(--text-xs)',
                color: 'var(--color-danger)',
                background: 'var(--color-danger-muted)',
                border: '0.5px solid var(--color-danger)',
                borderRadius: '8px',
                padding: '8px 12px',
              }}>
                {fixError}
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-col-reverse sm:flex-row justify-end gap-2.5 sm:gap-3 mt-1.5">
              <button
                onClick={() => setFixTarget(null)}
                style={{
                  height: '40px',
                  padding: '0 16px',
                  borderRadius: '8px',
                  background: 'transparent',
                  border: '0.5px solid var(--color-border)',
                  color: 'var(--color-foreground)',
                  fontSize: 'var(--text-sm)',
                  fontFamily: 'var(--font-inter)',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                id="fix-save-btn"
                onClick={handleSaveFix}
                disabled={savingFix}
                style={{
                  height: '40px',
                  padding: '0 20px',
                  borderRadius: '8px',
                  background: 'var(--color-primary)',
                  color: '#ffffff',
                  border: 'none',
                  fontSize: 'var(--text-sm)',
                  fontWeight: 600,
                  fontFamily: 'var(--font-inter)',
                  cursor: savingFix ? 'not-allowed' : 'pointer',
                  opacity: savingFix ? 0.7 : 1,
                }}
              >
                {savingFix ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── View Popup Modal (Admin, Manager & Staff) ────────────────────── */}
      {viewTarget && (
        <div
          onClick={() => setViewTarget(null)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9995,
            background: 'rgba(0,0,0,0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            className="w-full max-w-[calc(100vw-24px)] md:w-[460px] md:max-w-[460px] max-h-[90dvh] overflow-y-auto"
            style={{
              background: 'var(--color-surface-overlay)',
              border: '0.5px solid var(--color-border)',
              borderRadius: '16px',
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
              fontFamily: 'var(--font-inter)',
              boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <h3 style={{ fontSize: 'var(--text-lg)', fontWeight: 600, margin: 0, color: 'var(--color-foreground)' }}>
                  Time Log Details
                </h3>
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-muted)' }}>
                  {viewTarget.staffName} · {formatDateDisplay(viewTarget.date)}
                </span>
              </div>
              <button
                onClick={() => setViewTarget(null)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--color-foreground-muted)',
                  padding: '4px',
                }}
              >
                <i className="ti ti-x" style={{ fontSize: '18px' }} />
              </button>
            </div>

            {/* Old vs New Check-in */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{
                  fontSize: 'var(--text-xs)',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  color: 'var(--color-foreground-subtle)',
                }}>
                  Old Check-in
                </label>
                <div style={{
                  height: '38px',
                  display: 'flex',
                  alignItems: 'center',
                  padding: '0 12px',
                  background: 'var(--color-surface-raised)',
                  border: '0.5px solid var(--color-border)',
                  borderRadius: '8px',
                  fontSize: 'var(--text-sm)',
                  color: 'var(--color-foreground-muted)',
                }}>
                  {activeCorrection?.oldCheckIn
                    ? formatTime12h(activeCorrection.oldCheckIn)
                    : viewTarget.firstLog?.originalCheckInAt
                      ? formatTime12h(viewTarget.firstLog.originalCheckInAt)
                      : viewTarget.checkInDisplay}
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{
                  fontSize: 'var(--text-xs)',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  color: 'var(--color-foreground-subtle)',
                }}>
                  New Check-in
                </label>
                {isAdminOrManager ? (
                  <TimeField
                    value={viewCheckIn}
                    onChange={v => { setViewCheckIn(v); setViewChanged(true) }}
                  />
                ) : (
                  <div style={{
                    height: '38px',
                    display: 'flex',
                    alignItems: 'center',
                    padding: '0 12px',
                    background: 'var(--color-surface-raised)',
                    border: '0.5px solid var(--color-border)',
                    borderRadius: '8px',
                    fontSize: 'var(--text-sm)',
                    color: 'var(--color-foreground)',
                  }}>
                    {viewCheckIn ? formatTime12h(time24hToDate(viewTarget.date, viewCheckIn)) : '—'}
                  </div>
                )}
              </div>
            </div>

            {/* Old vs New Check-out */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{
                  fontSize: 'var(--text-xs)',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  color: 'var(--color-foreground-subtle)',
                }}>
                  Old Check-out
                </label>
                <div style={{
                  height: '38px',
                  display: 'flex',
                  alignItems: 'center',
                  padding: '0 12px',
                  background: 'var(--color-surface-raised)',
                  border: '0.5px solid var(--color-border)',
                  borderRadius: '8px',
                  fontSize: 'var(--text-sm)',
                  color: 'var(--color-foreground-muted)',
                }}>
                  {activeCorrection?.oldCheckOut
                    ? formatTime12h(activeCorrection.oldCheckOut)
                    : viewTarget.lastLog?.originalCheckOutAt
                      ? formatTime12h(viewTarget.lastLog.originalCheckOutAt)
                      : (viewTarget.isMissingCheckout ? 'Missing' : viewTarget.checkOutDisplay)}
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{
                  fontSize: 'var(--text-xs)',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  color: 'var(--color-foreground-subtle)',
                }}>
                  New Check-out
                </label>
                {isAdminOrManager ? (
                  <TimeField
                    value={viewCheckOut}
                    onChange={v => { setViewCheckOut(v); setViewChanged(true) }}
                  />
                ) : (
                  <div style={{
                    height: '38px',
                    display: 'flex',
                    alignItems: 'center',
                    padding: '0 12px',
                    background: 'var(--color-surface-raised)',
                    border: '0.5px solid var(--color-border)',
                    borderRadius: '8px',
                    fontSize: 'var(--text-sm)',
                    color: 'var(--color-foreground)',
                  }}>
                    {viewCheckOut ? formatTime12h(time24hToDate(viewTarget.date, viewCheckOut)) : '—'}
                  </div>
                )}
              </div>
            </div>

            {/* Reason */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{
                fontSize: 'var(--text-xs)',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                color: 'var(--color-foreground-subtle)',
              }}>
                Reason
              </label>
              {isAdminOrManager ? (
                <textarea
                  value={viewReason}
                  onChange={e => { setViewReason(e.target.value); setViewChanged(true) }}
                  placeholder="Reason for correction..."
                  rows={3}
                  style={{
                    fontFamily: 'var(--font-inter)',
                    background: 'var(--color-surface-raised)',
                    border: '0.5px solid var(--color-border)',
                    borderRadius: '8px',
                    padding: '8px 10px',
                    fontSize: 'var(--text-sm)',
                    color: 'var(--color-foreground)',
                    outline: 'none',
                    resize: 'none',
                  }}
                />
              ) : (
                <div style={{
                  padding: '10px 12px',
                  background: 'var(--color-surface-raised)',
                  border: '0.5px solid var(--color-border)',
                  borderRadius: '8px',
                  fontSize: 'var(--text-sm)',
                  color: 'var(--color-foreground)',
                  minHeight: '60px',
                }}>
                  {viewReason || <span style={{ color: 'var(--color-foreground-subtle)' }}>No reason provided.</span>}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex flex-col-reverse sm:flex-row justify-end gap-2.5 sm:gap-3 mt-1.5">
              <button
                onClick={() => setViewTarget(null)}
                style={{
                  height: '40px',
                  padding: '0 16px',
                  borderRadius: '8px',
                  background: 'transparent',
                  border: '0.5px solid var(--color-border)',
                  color: 'var(--color-foreground)',
                  fontSize: 'var(--text-sm)',
                  fontFamily: 'var(--font-inter)',
                  cursor: 'pointer',
                }}
              >
                Close
              </button>
              {isAdminOrManager && (
                <button
                  id="view-save-btn"
                  onClick={handleSaveView}
                  disabled={!viewChanged || savingView}
                  style={{
                    height: '40px',
                    padding: '0 20px',
                    borderRadius: '8px',
                    background: 'var(--color-primary)',
                    color: '#ffffff',
                    border: 'none',
                    fontSize: 'var(--text-sm)',
                    fontWeight: 600,
                    fontFamily: 'var(--font-inter)',
                    cursor: !viewChanged || savingView ? 'not-allowed' : 'pointer',
                    opacity: !viewChanged || savingView ? 0.5 : 1,
                  }}
                >
                  {savingView ? 'Saving...' : 'Save'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
