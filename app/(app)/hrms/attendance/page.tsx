'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import { format, addMonths, subMonths, getDaysInMonth } from 'date-fns'
import { useAuthStore } from '@/store/authStore'
import { DateField } from '@/components/shared/DateField'
import { ConfirmModal } from '@/components/shared/ConfirmModal'
import { Badge } from '@/components/shared/Badge'
import { TableRowSkeleton } from '@/components/shared/LoadingSkeleton'
import { useBackSwipe } from '@/hooks/useMobileGestures'
import {
  getMonthTimeLogs,
  getAllStaffMonthTimeLogs,
  computeDayStatus,
  getTodayDateString,
} from '@/lib/firebase/queries/timeLogs'
import {
  subscribeToMyLeaveRequests,
  subscribeToAllLeaveRequests,
  submitLeaveRequest,
} from '@/lib/firebase/queries/leaveRequests'
import {
  subscribeToStaffOnly,
  subscribeToAllAttendanceRecords,
  type StaffMember,
} from '@/lib/firebase/queries/staff'
import type { TimeLog, LeaveRequest, LeaveRequestType, AttendanceRecord } from '@/types'

// ─── Constants & Helpers ─────────────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
  P: 'P',
  L: 'L',
  H: 'H',
  LV: 'LV',
  AB: 'AB',
}

const STATUS_VARIANT: Record<string, string> = {
  P: 'present',
  L: 'late',
  H: 'halfDay',
  LV: 'leave',
  AB: 'absent',
}

const CALENDAR_STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  P: { bg: 'var(--color-success-muted)', color: 'var(--color-success)', label: 'P' },
  L: { bg: 'var(--color-secondary-muted)', color: 'var(--color-secondary)', label: 'L' },
  H: { bg: 'var(--color-accent-muted)', color: 'var(--color-accent)', label: 'H' },
  LV: { bg: 'var(--color-purple-muted)', color: 'var(--color-purple)', label: 'LV' },
  AB: { bg: 'var(--color-danger-muted)', color: 'var(--color-danger)', label: 'AB' },
}

function formatTime12h(d: Date): string {
  try {
    return format(d, 'h:mm a')
  } catch {
    return '—'
  }
}

/** Group TimeLog[] by date string "YYYY-MM-DD" */
function groupByDate(logs: TimeLog[]): Record<string, TimeLog[]> {
  const map: Record<string, TimeLog[]> = {}
  for (const log of logs) {
    if (!map[log.date]) map[log.date] = []
    map[log.date].push(log)
  }
  return map
}

/** Sum all closed + running minutes for a day's sessions */
function dayTotalMinutes(sessions: TimeLog[], now: Date, dateStr: string): number {
  const todayStr = getTodayDateString()
  const closed = sessions
    .filter(s => s.status === 'closed' && s.workedMinutes != null)
    .reduce((sum, s) => sum + (s.workedMinutes ?? 0), 0)
  const openSession = sessions.find(s => s.status === 'open')
  const running =
    dateStr === todayStr && openSession
      ? Math.max(0, Math.floor((now.getTime() - openSession.checkInAt.getTime()) / 60000))
      : 0
  return closed + running
}

// ─── Apply Popup (Leave only — Staff Role) ────────────────────────────────────

interface ApplyPopupProps {
  open: boolean
  onClose: () => void
  onSubmit: (date: string, type: LeaveRequestType, reason: string) => void
  submitting: boolean
  submitError: string
}

function ApplyPopup({ open, onClose, onSubmit, submitting, submitError }: ApplyPopupProps) {
  const [applyDate, setApplyDate] = useState(getTodayDateString())
  const [reason, setReason] = useState('')
  const applyType: LeaveRequestType = 'leave'
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [prevOpen, setPrevOpen] = useState(open)

  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) {
      setApplyDate(getTodayDateString())
      setReason('')
      setConfirmOpen(false)
    }
  }

  if (!open) return null

  const handleApplyClick = () => setConfirmOpen(true)
  const handleConfirm = () => onSubmit(applyDate, applyType, reason)
  const handleCancelConfirm = () => setConfirmOpen(false)

  const SELECT_STYLE: React.CSSProperties = {
    fontFamily: 'var(--font-inter)',
    height: '36px',
    background: 'var(--color-surface-raised)',
    border: '0.5px solid var(--color-border)',
    borderRadius: '8px',
    padding: '0 10px',
    fontSize: 'var(--text-sm)',
    color: 'var(--color-foreground)',
    outline: 'none',
    cursor: 'pointer',
    width: '100%',
  }

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 40,
          background: 'rgba(0,0,0,0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '16px',
        }}
      >
        <div
          onClick={e => e.stopPropagation()}
          style={{
            width: '100%',
            maxWidth: '380px',
            background: 'var(--color-surface-overlay)',
            border: '0.5px solid var(--color-border)',
            borderRadius: '16px',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '18px',
            fontFamily: 'var(--font-inter)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 'var(--text-lg)', fontWeight: 600, color: 'var(--color-foreground)' }}>
              Apply for Leave
            </span>
            <button
              onClick={onClose}
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

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label
              style={{
                fontSize: 'var(--text-xs)',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                color: 'var(--color-foreground-subtle)',
              }}
            >
              Date
            </label>
            <DateField value={applyDate} onChange={setApplyDate} placeholder="DD/MM/YYYY" />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label
              style={{
                fontSize: 'var(--text-xs)',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                color: 'var(--color-foreground-subtle)',
              }}
            >
              Type
            </label>
            <select id="apply-type-select" value={applyType} onChange={() => {}} style={SELECT_STYLE}>
              <option value="leave">Leave</option>
            </select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label
              style={{
                fontSize: 'var(--text-xs)',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                color: 'var(--color-foreground-subtle)',
              }}
            >
              Reason for Leave
            </label>
            <textarea
              id="apply-reason-input"
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Enter reason for leave..."
              rows={3}
              style={{
                ...SELECT_STYLE,
                height: 'auto',
                padding: '8px 10px',
                resize: 'none',
              }}
            />
          </div>

          {submitError && (
            <div
              style={{
                fontSize: 'var(--text-xs)',
                color: 'var(--color-danger)',
                background: 'var(--color-danger-muted)',
                border: '0.5px solid var(--color-danger)',
                borderRadius: '8px',
                padding: '8px 12px',
              }}
            >
              {submitError}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            <button
              onClick={onClose}
              style={{
                height: '36px',
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
              id="apply-submit-btn"
              onClick={handleApplyClick}
              disabled={!applyDate || submitting}
              style={{
                height: '36px',
                padding: '0 20px',
                borderRadius: '8px',
                background: 'var(--color-primary)',
                color: '#ffffff',
                border: 'none',
                fontSize: 'var(--text-sm)',
                fontWeight: 600,
                fontFamily: 'var(--font-inter)',
                cursor: !applyDate || submitting ? 'not-allowed' : 'pointer',
                opacity: !applyDate || submitting ? 0.7 : 1,
              }}
            >
              Apply
            </button>
          </div>
        </div>
      </div>

      <ConfirmModal
        open={confirmOpen}
        title="Submit Request"
        description={`Are you sure you want to submit this Leave request for ${
          applyDate ? format(new Date(applyDate + 'T00:00:00'), 'd MMM yyyy') : ''
        }?`}
        confirmLabel="Yes, Submit"
        cancelLabel="No, Go Back"
        variant="primary"
        onConfirm={handleConfirm}
        onCancel={handleCancelConfirm}
        loading={submitting}
      />
    </>
  )
}

// ─── Team Attendance View (Admin & Manager Role) ───────────────────────────────

function TeamAttendanceView() {
  const searchParams = useSearchParams()
  const [viewDate, setViewDate] = useState<Date>(() => {
    const y = Number(searchParams.get('year'))
    const m = Number(searchParams.get('month'))
    if (y && m) return new Date(y, m - 1, 1)
    return new Date()
  })
  const year = viewDate.getFullYear()
  const month = viewDate.getMonth() + 1

  // Filter state
  const [selectedStaffUid, setSelectedStaffUid] = useState<string>(() => searchParams.get('staff') || 'all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'present' | 'late' | 'halfDay' | 'leave' | 'absent'>('all')

  // Data State
  const [staffList, setStaffList] = useState<StaffMember[]>([])
  const [attendanceMap, setAttendanceMap] = useState<Record<string, AttendanceRecord>>({})
  const [monthLogsMap, setMonthLogsMap] = useState<Record<string, TimeLog[]>>({})
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedDayDetail, setSelectedDayDetail] = useState<{
    staffUid: string
    staffName: string
    day: number
    dayStr: string
    status: string | null
    minutes: number
  } | null>(null)
  const { backSwipeHandlers } = useBackSwipe()

  // Live 1-second clock tick for today's running session
  const [now, setNow] = useState<Date>(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  // Subscribe to staff members only (excluding admins & managers)
  useEffect(() => {
    const unsub = subscribeToStaffOnly(list => {
      setStaffList(list.filter(s => s.isActive !== false))
    })
    return () => unsub()
  }, [])

  // Subscribe to Firestore attendance collection records
  useEffect(() => {
    const unsub = subscribeToAllAttendanceRecords(year, month, recordsMap => {
      setAttendanceMap(recordsMap)
    })
    return () => unsub()
  }, [year, month])

  // Fetch month time logs for all staff
  useEffect(() => {
    let active = true
    getAllStaffMonthTimeLogs(year, month)
      .then(logsMap => {
        if (!active) return
        setMonthLogsMap(logsMap)
        setLoading(false)
      })
      .catch(err => {
        if (!active) return
        console.error('[attendance] getAllStaffMonthTimeLogs error:', err)
        setLoading(false)
      })
    return () => { active = false }
  }, [year, month])

  // Subscribe to all leave requests for month
  useEffect(() => {
    const unsub = subscribeToAllLeaveRequests(year, month, setLeaveRequests)
    return () => unsub()
  }, [year, month])

  // Filter staff list by selected staff UID
  const displayedStaff = useMemo(() => {
    if (selectedStaffUid === 'all') return staffList
    return staffList.filter(s => s.uid === selectedStaffUid)
  }, [staffList, selectedStaffUid])

  // Index leave requests by staffUid_date
  const leaveMap = useMemo(() => {
    const map: Record<string, LeaveRequest> = {}
    for (const r of leaveRequests) {
      if (r.status === 'approved') {
        map[`${r.staffUid}_${r.date}`] = r
      }
    }
    return map
  }, [leaveRequests])

  const daysInMonth = getDaysInMonth(new Date(year, month - 1))
  const dayNumbers = Array.from({ length: daysInMonth }, (_, i) => i + 1)
  const monthStr = String(month).padStart(2, '0')

  // Compute matrix data for each staff member
  const matrixData = useMemo(() => {
    return displayedStaff.map(staff => {
      const attRecord = attendanceMap[staff.uid]
      const logs = monthLogsMap[staff.uid] ?? []
      const logsByDate = groupByDate(logs)

      let P = 0,
        L = 0,
        H = 0,
        LV = 0,
        AB = 0,
        totalMinutes = 0

      const days = dayNumbers.map(day => {
        const dayStr = `${year}-${monthStr}-${String(day).padStart(2, '0')}`

        const rawDocStatus = attRecord?.dailyStatus?.[day] || attRecord?.dailyStatus?.[String(day)] || (attRecord?.dailyStatus as Record<string, string>)?.[dayStr]

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
          const approvedLeave = Boolean(leaveMap[`${staff.uid}_${dayStr}`])
          status = computeDayStatus(sessions, dayStr, now, approvedLeave)
        }

        let minutes = 0
        if (attRecord?.dailyHours?.[day] != null) {
          minutes = attRecord.dailyHours[day]
        } else if (attRecord?.dailyHours?.[String(day)] != null) {
          minutes = attRecord.dailyHours[String(day)]
        } else if ((attRecord?.dailyHours as Record<string, number>)?.[dayStr] != null) {
          minutes = (attRecord?.dailyHours as Record<string, number>)[dayStr]
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

        return { day, dayStr, status, minutes }
      })

      const h = Math.floor(totalMinutes / 60)
      const hoursLabel = `${h}h`

      return {
        staff,
        days,
        summary: { P, L, H, LV, AB, totalMinutes, hoursLabel },
      }
    })
  }, [displayedStaff, attendanceMap, monthLogsMap, leaveMap, dayNumbers, year, monthStr, now])

  // Filter matrixData by statusFilter for mobile cards
  const filteredMatrixData = useMemo(() => {
    if (statusFilter === 'all') return matrixData
    return matrixData.filter(row => {
      if (statusFilter === 'present') return row.summary.P > 0
      if (statusFilter === 'late') return row.summary.L > 0
      if (statusFilter === 'halfDay') return row.summary.H > 0
      if (statusFilter === 'leave') return row.summary.LV > 0
      if (statusFilter === 'absent') return row.summary.AB > 0
      return true
    })
  }, [matrixData, statusFilter])

  // Footer Totals
  const totals = useMemo(() => {
    let P = 0,
      L = 0,
      AB = 0,
      totalMinutes = 0
    for (const row of matrixData) {
      P += row.summary.P
      L += row.summary.L
      AB += row.summary.AB
      totalMinutes += row.summary.totalMinutes
    }
    const h = Math.floor(totalMinutes / 60)
    const hoursLabel = `${h}h`

    const todayStr = getTodayDateString()
    const todayNum = parseInt(todayStr.split('-')[2], 10)
    const activeDaysCount = Math.min(todayNum, daysInMonth)
    const totalPossible = matrixData.length * activeDaysCount
    const presentRate = totalPossible > 0 ? Math.round(((P + L) / totalPossible) * 100) : 0

    return {
      P,
      L,
      AB,
      hoursLabel,
      presentRate,
      activeDaysCount,
    }
  }, [matrixData, daysInMonth])

  // CSV Export Engine
  const handleExportCSV = () => {
    if (matrixData.length === 0) return

    const monthName = format(viewDate, 'MMMM')
    const headers = ['STAFF', ...dayNumbers.map(d => String(d)), 'P', 'L', 'AB', 'HOURS']

    const csvRows: string[][] = [headers]

    for (const row of matrixData) {
      const dayCells = row.days.map(d => {
        if (!d.status) return '-'
        return d.status
      })

      csvRows.push([
        `"${row.staff.name.replace(/"/g, '""')}"`,
        ...dayCells,
        String(row.summary.P),
        String(row.summary.L),
        String(row.summary.AB),
        `"${row.summary.hoursLabel}"`,
      ])
    }

    csvRows.push([
      '"TOTALS"',
      ...Array(dayNumbers.length).fill(''),
      String(totals.P),
      String(totals.L),
      String(totals.AB),
      `"${totals.hoursLabel}"`,
    ])

    const csvContent = csvRows.map(e => e.join(',')).join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `Attendance_Report_${monthName}_${year}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const TH: React.CSSProperties = {
    fontSize: 'var(--text-xs)',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    color: 'var(--color-foreground-subtle)',
    padding: '12px 4px',
    borderBottom: '0.5px solid var(--color-border-strong)',
    whiteSpace: 'nowrap',
    fontFamily: 'var(--font-inter)',
  }

  const TD: React.CSSProperties = {
    padding: '8px 2px',
    height: '44px',
    borderBottom: '0.5px solid var(--color-border)',
    verticalAlign: 'middle',
    fontFamily: 'var(--font-inter)',
  }

  const SELECT_STYLE: React.CSSProperties = {
    fontFamily: 'var(--font-inter)',
    height: '38px',
    background: 'var(--color-surface)',
    border: '0.5px solid var(--color-border)',
    borderRadius: '10px',
    padding: '0 32px 0 12px',
    fontSize: 'var(--text-sm)',
    color: 'var(--color-foreground)',
    outline: 'none',
    appearance: 'none',
    WebkitAppearance: 'none',
    MozAppearance: 'none',
    cursor: 'pointer',
  }

  return (
    <div
      className="p-3.5 sm:p-6 md:p-8 max-w-[1280px] mx-auto flex flex-col gap-4 sm:gap-5"
      style={{
        fontFamily: 'var(--font-inter)',
        color: 'var(--color-foreground)',
      }}
    >
      {/* ── DESKTOP HEADER CONTROLS (≥768px): 100% Invariant ── */}
      <div className="hidden md:flex items-center justify-between gap-4 flex-wrap">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          {/* Month Selector Pill */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              background: 'var(--color-surface)',
              border: '0.5px solid var(--color-border)',
              borderRadius: '10px',
              padding: '4px 12px',
              height: '38px',
            }}
          >
            <button
              id="att-prev-month"
              onClick={() => setViewDate(d => subMonths(d, 1))}
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--color-foreground-muted)',
                display: 'flex',
                alignItems: 'center',
                padding: 0,
              }}
            >
              <i className="ti ti-chevron-left" style={{ fontSize: '16px' }} />
            </button>

            <span
              style={{
                fontSize: 'var(--text-sm)',
                fontWeight: 600,
                minWidth: '100px',
                textAlign: 'center',
                color: 'var(--color-foreground)',
              }}
            >
              {format(viewDate, 'MMMM yyyy')}
            </span>

            <button
              id="att-next-month"
              onClick={() => setViewDate(d => addMonths(d, 1))}
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--color-foreground-muted)',
                display: 'flex',
                alignItems: 'center',
                padding: 0,
              }}
            >
              <i className="ti ti-chevron-right" style={{ fontSize: '16px' }} />
            </button>
          </div>

          {/* Staff Filter Dropdown */}
          <div style={{ position: 'relative' }}>
            <select
              value={selectedStaffUid}
              onChange={e => setSelectedStaffUid(e.target.value)}
              style={SELECT_STYLE}
            >
              <option value="all" style={{ background: 'var(--color-surface)', color: 'var(--color-foreground)' }}>
                All staff
              </option>
              {staffList.map(s => (
                <option
                  key={s.uid}
                  value={s.uid}
                  style={{ background: 'var(--color-surface)', color: 'var(--color-foreground)' }}
                >
                  {s.name}
                </option>
              ))}
            </select>
            <i
              className="ti ti-chevron-down"
              style={{
                position: 'absolute',
                right: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                pointerEvents: 'none',
                color: 'var(--color-foreground-muted)',
                fontSize: '14px',
              }}
            />
          </div>
        </div>

        {/* Right side: Legend Strip + Export CSV Button */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
          {/* Legend Items matching Staff View strictly */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
            {[
              { label: 'Present', color: 'var(--color-success)' },
              { label: 'Late', color: 'var(--color-secondary)' },
              { label: 'Half day', color: 'var(--color-accent)' },
              { label: 'Absent', color: 'var(--color-danger)' },
              { label: 'Leave', color: 'var(--color-purple)' },
            ].map(({ label, color }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span
                  style={{
                    width: '10px',
                    height: '10px',
                    borderRadius: '2px',
                    background: color,
                    display: 'inline-block',
                  }}
                />
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-muted)' }}>
                  {label}
                </span>
              </div>
            ))}
          </div>

          {/* Export CSV Button — styled as Primary Button token */}
          <button
            onClick={handleExportCSV}
            style={{
              height: '36px',
              padding: '0 20px',
              borderRadius: '18px',
              background: 'var(--color-primary)',
              color: '#ffffff',
              border: 'none',
              fontSize: 'var(--text-xs)',
              fontWeight: 600,
              fontFamily: 'var(--font-inter)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'opacity 0.15s',
            }}
          >
            <i className="ti ti-file-spreadsheet" style={{ fontSize: '16px' }} />
            Export CSV
          </button>
        </div>
      </div>

      {/* ── MOBILE HEADER CONTROLS (<768px): Touch-optimized ── */}
      <div className="flex md:hidden flex-col gap-3">
        {/* Row 1: Month Selector + Export CSV */}
        <div className="flex items-center justify-between gap-2">
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              background: 'var(--color-surface)',
              border: '0.5px solid var(--color-border)',
              borderRadius: '10px',
              padding: '4px 12px',
              height: '38px',
            }}
          >
            <button
              id="att-prev-month-mobile"
              onClick={() => setViewDate(d => subMonths(d, 1))}
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--color-foreground-muted)',
                display: 'flex',
                alignItems: 'center',
                padding: 0,
              }}
            >
              <i className="ti ti-chevron-left" style={{ fontSize: '16px' }} />
            </button>

            <span
              style={{
                fontSize: 'var(--text-sm)',
                fontWeight: 600,
                minWidth: '105px',
                textAlign: 'center',
                color: 'var(--color-foreground)',
              }}
            >
              {format(viewDate, 'MMMM yyyy')}
            </span>

            <button
              id="att-next-month-mobile"
              onClick={() => setViewDate(d => addMonths(d, 1))}
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--color-foreground-muted)',
                display: 'flex',
                alignItems: 'center',
                padding: 0,
              }}
            >
              <i className="ti ti-chevron-right" style={{ fontSize: '16px' }} />
            </button>
          </div>

          <button
            onClick={handleExportCSV}
            style={{
              height: '38px',
              padding: '0 14px',
              borderRadius: '10px',
              background: 'var(--color-surface)',
              border: '0.5px solid var(--color-border)',
              color: 'var(--color-foreground)',
              fontSize: 'var(--text-xs)',
              fontWeight: 600,
              fontFamily: 'var(--font-inter)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <i className="ti ti-file-spreadsheet" style={{ fontSize: '16px', color: 'var(--color-primary)' }} />
            Export
          </button>
        </div>

        {/* Row 2: Staff Dropdown Selector */}
        <div style={{ position: 'relative', width: '100%' }}>
          <select
            value={selectedStaffUid}
            onChange={e => setSelectedStaffUid(e.target.value)}
            style={{
              ...SELECT_STYLE,
              width: '100%',
              paddingRight: '36px',
            }}
          >
            <option value="all" style={{ background: 'var(--color-surface)', color: 'var(--color-foreground)' }}>
              All staff members ({staffList.length})
            </option>
            {staffList.map(s => (
              <option
                key={s.uid}
                value={s.uid}
                style={{ background: 'var(--color-surface)', color: 'var(--color-foreground)' }}
              >
                {s.name}
              </option>
            ))}
          </select>
          <i
            className="ti ti-chevron-down"
            style={{
              position: 'absolute',
              right: '12px',
              top: '50%',
              transform: 'translateY(-50%)',
              pointerEvents: 'none',
              color: 'var(--color-foreground-muted)',
              fontSize: '14px',
            }}
          />
        </div>

        {/* Row 3: Rule 15.7.2 Quick Filter Swiper (Status Chips) */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            overflowX: 'auto',
            scrollbarWidth: 'none',
            paddingBottom: '2px',
          }}
        >
          {[
            { id: 'all', label: 'All Staff' },
            { id: 'present', label: `Present (${totals.P})` },
            { id: 'late', label: `Late (${totals.L})` },
            { id: 'halfDay', label: 'Half Day' },
            { id: 'leave', label: 'Leave' },
            { id: 'absent', label: `Absent (${totals.AB})` },
          ].map(f => {
            const active = statusFilter === f.id
            return (
              <button
                key={f.id}
                onClick={() => setStatusFilter(f.id as typeof statusFilter)}
                style={{
                  flexShrink: 0,
                  padding: '6px 12px',
                  borderRadius: '20px',
                  fontSize: 'var(--text-xs)',
                  fontWeight: 600,
                  border: active ? '1px solid var(--color-primary)' : '0.5px solid var(--color-border)',
                  background: active ? 'var(--color-primary-muted)' : 'var(--color-surface)',
                  color: active ? 'var(--color-primary)' : 'var(--color-foreground-muted)',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                {f.label}
              </button>
            )
          })}
        </div>

        {/* Row 4: Compact Horizontal Scrollable Legend Strip */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            overflowX: 'auto',
            scrollbarWidth: 'none',
            padding: '4px 2px',
          }}
        >
          {[
            { label: 'Present', color: 'var(--color-success)' },
            { label: 'Late', color: 'var(--color-secondary)' },
            { label: 'Half day', color: 'var(--color-accent)' },
            { label: 'Absent', color: 'var(--color-danger)' },
            { label: 'Leave', color: 'var(--color-purple)' },
          ].map(({ label, color }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '5px', flexShrink: 0 }}>
              <span
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '2px',
                  background: color,
                  display: 'inline-block',
                }}
              />
              <span style={{ fontSize: '11px', color: 'var(--color-foreground-muted)' }}>
                {label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ── DESKTOP ATTENDANCE TABLE (≥768px): 100% Invariant ── */}
      <div className="hidden md:block">
      {/* ── Attendance Grid Container ───────────────────────────────────── */}
      <div
        style={{
          background: 'var(--color-surface)',
          border: '0.5px solid var(--color-border)',
          borderRadius: '12px',
          overflow: 'hidden',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
        }}
      >
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-sm)', tableLayout: 'auto' }}>
            <thead>
              <tr style={{ background: 'var(--color-surface-raised)' }}>
                {/* STAFF column header */}
                <th style={{ ...TH, textAlign: 'left', paddingLeft: '16px' }}>STAFF</th>

                {/* Day numbers 1..31 */}
                {dayNumbers.map(d => (
                  <th key={d} style={{ ...TH, textAlign: 'center', padding: '12px 2px' }}>
                    {d}
                  </th>
                ))}

                {/* Metric Columns */}
                <th style={{ ...TH, textAlign: 'center', color: 'var(--color-success)', padding: '12px 4px' }}>P</th>
                <th style={{ ...TH, textAlign: 'center', color: 'var(--color-secondary)', padding: '12px 4px' }}>L</th>
                <th style={{ ...TH, textAlign: 'center', color: 'var(--color-danger)', padding: '12px 4px' }}>AB</th>
                <th
                  style={{
                    ...TH,
                    textAlign: 'right',
                    paddingRight: '16px',
                    color: 'var(--color-foreground-subtle)',
                  }}
                >
                  HOURS
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <TableRowSkeleton rows={5} cols={dayNumbers.length + 5} />
              ) : matrixData.length === 0 ? (
                <tr>
                  <td
                    colSpan={dayNumbers.length + 5}
                    style={{
                      ...TD,
                      textAlign: 'center',
                      color: 'var(--color-foreground-subtle)',
                      padding: '32px',
                    }}
                  >
                    No staff records found.
                  </td>
                </tr>
              ) : (
                matrixData.map(row => (
                  <tr key={row.staff.uid}>
                    {/* Staff Name */}
                    <td
                      style={{
                        ...TD,
                        paddingLeft: '16px',
                        fontWeight: 600,
                        fontSize: 'var(--text-sm)',
                        color: 'var(--color-foreground)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {row.staff.name}
                    </td>

                    {/* Day cells (1..daysInMonth) */}
                    {row.days.map(({ day, status }) => (
                      <td key={day} style={{ ...TD, textAlign: 'center', padding: '0 1px' }}>
                        {status ? (
                          <Badge
                            variant={STATUS_VARIANT[status] ?? 'notIn'}
                            label={STATUS_LABEL[status] ?? status}
                          />
                        ) : (
                          <span style={{ color: 'var(--color-foreground-subtle)', fontSize: '12px' }}>·</span>
                        )}
                      </td>
                    ))}

                    {/* Present Count */}
                    <td
                      style={{
                        ...TD,
                        textAlign: 'center',
                        fontWeight: 700,
                        fontSize: 'var(--text-sm)',
                        color: 'var(--color-success)',
                        padding: '0 4px',
                      }}
                    >
                      {row.summary.P}
                    </td>

                    {/* Late Count */}
                    <td
                      style={{
                        ...TD,
                        textAlign: 'center',
                        fontWeight: 700,
                        fontSize: 'var(--text-sm)',
                        color: 'var(--color-secondary)',
                        padding: '0 4px',
                      }}
                    >
                      {row.summary.L}
                    </td>

                    {/* Absent Count */}
                    <td
                      style={{
                        ...TD,
                        textAlign: 'center',
                        fontWeight: 700,
                        fontSize: 'var(--text-sm)',
                        color: 'var(--color-danger)',
                        padding: '0 4px',
                      }}
                    >
                      {row.summary.AB}
                    </td>

                    {/* Total Hours */}
                    <td
                      style={{
                        ...TD,
                        textAlign: 'right',
                        paddingRight: '16px',
                        fontWeight: 600,
                        fontSize: 'var(--text-sm)',
                        color: 'var(--color-foreground)',
                      }}
                    >
                      {row.summary.hoursLabel}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {/* Totals Footer Row */}
            {!loading && matrixData.length > 0 && (
              <tfoot>
                <tr style={{ background: 'var(--color-surface-raised)' }}>
                  <td
                    style={{
                      ...TD,
                      paddingLeft: '16px',
                      fontWeight: 700,
                      fontSize: 'var(--text-xs)',
                      letterSpacing: '0.04em',
                      color: 'var(--color-foreground-subtle)',
                      borderTop: '0.5px solid var(--color-border-strong)',
                      borderBottom: 'none',
                    }}
                  >
                    TOTALS
                  </td>
                  <td
                    colSpan={dayNumbers.length}
                    style={{
                      ...TD,
                      paddingLeft: '12px',
                      fontSize: 'var(--text-xs)',
                      color: 'var(--color-foreground-muted)',
                      borderTop: '0.5px solid var(--color-border-strong)',
                      borderBottom: 'none',
                    }}
                  >
                    Team attendance to {totals.activeDaysCount} {format(viewDate, 'MMM')} · {totals.presentRate}%
                    present · {totals.L} late marks · {totals.AB} absences
                  </td>
                  <td
                    style={{
                      ...TD,
                      textAlign: 'center',
                      fontWeight: 700,
                      fontSize: 'var(--text-sm)',
                      color: 'var(--color-success)',
                      borderTop: '0.5px solid var(--color-border-strong)',
                      borderBottom: 'none',
                      padding: '0 4px',
                    }}
                  >
                    {totals.P}
                  </td>
                  <td
                    style={{
                      ...TD,
                      textAlign: 'center',
                      fontWeight: 700,
                      fontSize: 'var(--text-sm)',
                      color: 'var(--color-secondary)',
                      borderTop: '0.5px solid var(--color-border-strong)',
                      borderBottom: 'none',
                      padding: '0 4px',
                    }}
                  >
                    {totals.L}
                  </td>
                  <td
                    style={{
                      ...TD,
                      textAlign: 'center',
                      fontWeight: 700,
                      fontSize: 'var(--text-sm)',
                      color: 'var(--color-danger)',
                      borderTop: '0.5px solid var(--color-border-strong)',
                      borderBottom: 'none',
                      padding: '0 4px',
                    }}
                  >
                    {totals.AB}
                  </td>
                  <td
                    style={{
                      ...TD,
                      textAlign: 'right',
                      paddingRight: '16px',
                      fontWeight: 700,
                      fontSize: 'var(--text-sm)',
                      color: 'var(--color-foreground)',
                      borderTop: '0.5px solid var(--color-border-strong)',
                      borderBottom: 'none',
                    }}
                  >
                    {totals.hoursLabel}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
      </div>
      {/* ── END DESKTOP ATTENDANCE TABLE ── */}

      {/* ── MOBILE VIEW (<768px): Employee Summary Cards + Interactive Day Strip (Rule 15.7.2) ── */}
      <div
        className="block md:hidden"
        {...backSwipeHandlers}
        style={{ paddingBottom: '80px' }}
      >
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {[1, 2, 3].map(n => (
              <div
                key={n}
                style={{
                  height: '180px',
                  borderRadius: '14px',
                  background: 'var(--color-surface)',
                  border: '0.5px solid var(--color-border)',
                }}
              />
            ))}
          </div>
        ) : filteredMatrixData.length === 0 ? (
          <div
            style={{
              padding: '36px 20px',
              borderRadius: '14px',
              background: 'var(--color-surface)',
              border: '0.5px solid var(--color-border)',
              textAlign: 'center',
            }}
          >
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-foreground-muted)', margin: 0 }}>
              No staff records found for this filter.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {filteredMatrixData.map(row => {
              const presentCount = row.summary.P
              const totalDaysWorked = row.summary.P + row.summary.L + row.summary.H + row.summary.AB
              const presencePercent = totalDaysWorked > 0 ? Math.round(((presentCount + row.summary.L) / totalDaysWorked) * 100) : 100
              const todayStr = getTodayDateString()

              return (
                <div
                  key={row.staff.uid}
                  style={{
                    background: 'var(--color-surface)',
                    border: '0.5px solid var(--color-border)',
                    borderRadius: '14px',
                    padding: '16px',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                  }}
                >
                  {/* Header: Avatar, Name, Role, Presence % Badge */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div
                        style={{
                          width: '38px',
                          height: '38px',
                          borderRadius: '50%',
                          background: 'var(--color-primary-muted)',
                          color: 'var(--color-primary)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '13px',
                          fontWeight: 700,
                          border: '0.5px solid var(--color-primary)',
                        }}
                      >
                        {row.staff.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--color-foreground)' }}>
                          {row.staff.name}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--color-foreground-muted)' }}>
                          {row.staff.role || 'Staff'} · {row.summary.hoursLabel} worked
                        </div>
                      </div>
                    </div>

                    <span
                      style={{
                        fontSize: 'var(--text-xs)',
                        fontWeight: 700,
                        padding: '3px 10px',
                        borderRadius: '12px',
                        background: presencePercent >= 80 ? 'var(--color-success-muted)' : presencePercent >= 50 ? 'var(--color-secondary-muted)' : 'var(--color-danger-muted)',
                        color: presencePercent >= 80 ? 'var(--color-success)' : presencePercent >= 50 ? 'var(--color-secondary)' : 'var(--color-danger)',
                        border: `0.5px solid ${presencePercent >= 80 ? 'var(--color-success)' : presencePercent >= 50 ? 'var(--color-secondary)' : 'var(--color-danger)'}`,
                      }}
                    >
                      {presencePercent}% Present
                    </span>
                  </div>

                  {/* 5-item Summary Metric Bar */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(5, 1fr)',
                      gap: '6px',
                      marginBottom: '14px',
                      padding: '8px 4px',
                      borderRadius: '10px',
                      background: 'var(--color-surface-raised)',
                      border: '0.5px solid var(--color-border)',
                      textAlign: 'center',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '9px', fontWeight: 600, color: 'var(--color-success)' }}>P</div>
                      <div style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--color-foreground)' }}>
                        {row.summary.P}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '9px', fontWeight: 600, color: 'var(--color-secondary)' }}>L</div>
                      <div style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--color-foreground)' }}>
                        {row.summary.L}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '9px', fontWeight: 600, color: 'var(--color-accent)' }}>H</div>
                      <div style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--color-foreground)' }}>
                        {row.summary.H}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '9px', fontWeight: 600, color: 'var(--color-purple)' }}>LV</div>
                      <div style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--color-foreground)' }}>
                        {row.summary.LV}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '9px', fontWeight: 600, color: 'var(--color-danger)' }}>AB</div>
                      <div style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--color-foreground)' }}>
                        {row.summary.AB}
                      </div>
                    </div>
                  </div>

                  {/* Day-by-Day Swipeable Attendance Strip */}
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <span style={{ fontSize: '10px', fontWeight: 600, color: 'var(--color-foreground-subtle)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        DAY-BY-DAY ATTENDANCE · {format(viewDate, 'MMM yyyy')}
                      </span>
                      <span style={{ fontSize: '10px', color: 'var(--color-foreground-muted)' }}>
                        Tap day for details
                      </span>
                    </div>

                    {/* Scrollable Day Strip (All days in month) */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        overflowX: 'auto',
                        scrollbarWidth: 'none',
                        WebkitOverflowScrolling: 'touch',
                        padding: '2px 0 6px 0',
                      }}
                    >
                      {row.days.map(d => {
                        const isToday = d.dayStr === todayStr
                        const st = d.status
                        const styleCfg = st ? CALENDAR_STATUS_STYLE[st] : null

                        return (
                          <button
                            key={d.day}
                            type="button"
                            onClick={() =>
                              setSelectedDayDetail({
                                staffUid: row.staff.uid,
                                staffName: row.staff.name,
                                day: d.day,
                                dayStr: d.dayStr,
                                status: d.status,
                                minutes: d.minutes,
                              })
                            }
                            style={{
                              flexShrink: 0,
                              width: '42px',
                              minHeight: '48px',
                              padding: '4px 2px',
                              borderRadius: '8px',
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              background: isToday ? 'var(--color-primary-muted)' : 'var(--color-surface-raised)',
                              border: isToday
                                ? '1.5px solid var(--color-primary)'
                                : '0.5px solid var(--color-border)',
                              cursor: 'pointer',
                              transition: 'transform 0.1s ease',
                            }}
                          >
                            <span
                              style={{
                                fontSize: '10px',
                                fontWeight: isToday ? 700 : 500,
                                color: isToday ? 'var(--color-primary)' : 'var(--color-foreground-muted)',
                              }}
                            >
                              {d.day}
                            </span>
                            {styleCfg ? (
                              <span
                                style={{
                                  fontSize: '10px',
                                  fontWeight: 700,
                                  padding: '1px 4px',
                                  borderRadius: '4px',
                                  background: styleCfg.bg,
                                  color: styleCfg.color,
                                  lineHeight: 1.2,
                                }}
                              >
                                {styleCfg.label}
                              </span>
                            ) : (
                              <span style={{ fontSize: '11px', color: 'var(--color-foreground-subtle)', lineHeight: 1.2 }}>
                                ·
                              </span>
                            )}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* 15.7.2 Day Detail Bottom Sheet Drawer */}
      {selectedDayDetail && (() => {
        const staffLogs = (monthLogsMap[selectedDayDetail.staffUid] ?? []).filter(
          l => l.date === selectedDayDetail.dayStr
        )
        const staffLeave = leaveRequests.find(
          r => r.staffUid === selectedDayDetail.staffUid && r.date === selectedDayDetail.dayStr && r.status === 'approved'
        )

        return (
          <>
            <div
              onClick={() => setSelectedDayDetail(null)}
              style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(0,0,0,0.7)',
                backdropFilter: 'blur(4px)',
                zIndex: 9990,
              }}
            />
            <div
              style={{
                position: 'fixed',
                bottom: 0,
                left: 0,
                right: 0,
                background: 'var(--color-surface-overlay)',
                borderTop: '0.5px solid var(--color-border)',
                borderTopLeftRadius: '20px',
                borderTopRightRadius: '20px',
                padding: '16px 20px 32px 20px',
                maxHeight: '85vh',
                overflowY: 'auto',
                zIndex: 9995,
                fontFamily: 'var(--font-inter)',
              }}
            >
              {/* Grabber handle */}
              <div
                style={{
                  width: '36px',
                  height: '4px',
                  background: 'var(--color-border-strong)',
                  borderRadius: '2px',
                  margin: '0 auto 16px auto',
                }}
              />

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                <div>
                  <h3 style={{ fontSize: 'var(--text-base)', fontWeight: 700, margin: 0, color: 'var(--color-foreground)' }}>
                    {selectedDayDetail.staffName}
                  </h3>
                  <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-muted)', margin: '2px 0 0 0' }}>
                    {format(new Date(selectedDayDetail.dayStr + 'T00:00:00'), 'EEEE, d MMMM yyyy')}
                  </p>
                </div>

                <span
                  style={{
                    fontSize: 'var(--text-xs)',
                    fontWeight: 700,
                    padding: '4px 12px',
                    borderRadius: '6px',
                    background:
                      selectedDayDetail.status === 'P'
                        ? 'var(--color-success-muted)'
                        : selectedDayDetail.status === 'AB'
                        ? 'var(--color-danger-muted)'
                        : selectedDayDetail.status === 'LV'
                        ? 'var(--color-purple-muted)'
                        : 'var(--color-secondary-muted)',
                    color:
                      selectedDayDetail.status === 'P'
                        ? 'var(--color-success)'
                        : selectedDayDetail.status === 'AB'
                        ? 'var(--color-danger)'
                        : selectedDayDetail.status === 'LV'
                        ? 'var(--color-purple)'
                        : 'var(--color-secondary)',
                    border: '0.5px solid currentColor',
                  }}
                >
                  {selectedDayDetail.status ? STATUS_LABEL[selectedDayDetail.status] || selectedDayDetail.status : 'No Record'}
                </span>
              </div>

              {/* Shift & Time Summary Grid */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '10px',
                  padding: '14px',
                  borderRadius: '10px',
                  background: 'var(--color-surface-raised)',
                  border: '0.5px solid var(--color-border)',
                  marginBottom: '16px',
                }}
              >
                <div>
                  <span style={{ fontSize: '10px', color: 'var(--color-foreground-subtle)', display: 'block' }}>WORKED TIME</span>
                  <span style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--color-foreground)' }}>
                    {selectedDayDetail.minutes > 0 ? `${Math.floor(selectedDayDetail.minutes / 60)}h ${selectedDayDetail.minutes % 60}m` : '0h 0m'}
                  </span>
                </div>
                <div>
                  <span style={{ fontSize: '10px', color: 'var(--color-foreground-subtle)', display: 'block' }}>STANDARD SHIFT</span>
                  <span style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--color-foreground)' }}>
                    9h 00m
                  </span>
                </div>
                <div>
                  <span style={{ fontSize: '10px', color: 'var(--color-foreground-subtle)', display: 'block' }}>OVERTIME / DEFICIT</span>
                  <span
                    style={{
                      fontSize: 'var(--text-sm)',
                      fontWeight: 700,
                      color:
                        selectedDayDetail.minutes >= 540
                          ? 'var(--color-success)'
                          : 'var(--color-foreground-muted)',
                    }}
                  >
                    {selectedDayDetail.minutes >= 540
                      ? `+${Math.floor((selectedDayDetail.minutes - 540) / 60)}h ${(selectedDayDetail.minutes - 540) % 60}m`
                      : `-${Math.floor((540 - selectedDayDetail.minutes) / 60)}h ${(540 - selectedDayDetail.minutes) % 60}m`}
                  </span>
                </div>
                <div>
                  <span style={{ fontSize: '10px', color: 'var(--color-foreground-subtle)', display: 'block' }}>DAY STATUS</span>
                  <span style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--color-foreground)' }}>
                    {selectedDayDetail.status === 'P' ? 'Present' : selectedDayDetail.status === 'L' ? 'Late' : selectedDayDetail.status === 'H' ? 'Half Day' : selectedDayDetail.status === 'LV' ? 'On Leave' : selectedDayDetail.status === 'AB' ? 'Absent' : 'Unrecorded'}
                  </span>
                </div>
              </div>

              {/* Sessions or Leave Details */}
              <div style={{ marginBottom: '20px' }}>
                {staffLogs.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', color: 'var(--color-foreground-subtle)', letterSpacing: '0.04em' }}>
                      Clock-in / Clock-out Sessions
                    </div>
                    {staffLogs.map((sess, idx) => (
                      <div
                        key={sess.logId || idx}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '10px 12px',
                          borderRadius: '8px',
                          background: 'var(--color-surface-raised)',
                          border: '0.5px solid var(--color-border)',
                          fontSize: 'var(--text-xs)',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <i className="ti ti-clock-hour-4" style={{ color: 'var(--color-primary)', fontSize: '14px' }} />
                          <span style={{ fontWeight: 600, color: 'var(--color-foreground)' }}>
                            {formatTime12h(sess.checkInAt)}
                          </span>
                          <i className="ti ti-arrow-right" style={{ color: 'var(--color-foreground-subtle)', fontSize: '10px' }} />
                          <span style={{ color: 'var(--color-foreground)' }}>
                            {sess.checkOutAt ? formatTime12h(sess.checkOutAt) : 'In progress'}
                          </span>
                        </div>
                        <span style={{ fontWeight: 600, color: 'var(--color-foreground-muted)' }}>
                          {sess.workedMinutes != null
                            ? `${Math.floor(sess.workedMinutes / 60)}h ${sess.workedMinutes % 60}m`
                            : 'Active'}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : staffLeave ? (
                  <div
                    style={{
                      fontSize: 'var(--text-xs)',
                      color: 'var(--color-purple)',
                      background: 'var(--color-purple-muted)',
                      padding: '12px 14px',
                      borderRadius: '8px',
                      border: '0.5px solid var(--color-purple)',
                    }}
                  >
                    <div style={{ fontWeight: 700, marginBottom: '4px' }}>Approved Leave Request</div>
                    <div>Reason: {staffLeave.reason || 'Personal Leave'}</div>
                  </div>
                ) : selectedDayDetail.status === 'AB' ? (
                  <div
                    style={{
                      fontSize: 'var(--text-xs)',
                      color: 'var(--color-danger)',
                      background: 'var(--color-danger-muted)',
                      padding: '12px 14px',
                      borderRadius: '8px',
                      border: '0.5px solid var(--color-danger)',
                    }}
                  >
                    Marked Absent — No check-in records for this workday
                  </div>
                ) : (
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-muted)', fontStyle: 'italic', padding: '8px 0' }}>
                    No timeclock sessions recorded for this day
                  </div>
                )}
              </div>

              <button
                onClick={() => setSelectedDayDetail(null)}
                style={{
                  width: '100%',
                  height: '44px',
                  borderRadius: '10px',
                  background: 'var(--color-primary)',
                  color: '#ffffff',
                  border: 'none',
                  fontWeight: 600,
                  fontSize: 'var(--text-sm)',
                  cursor: 'pointer',
                }}
              >
                Close
              </button>
            </div>
          </>
        )
      })()}
    </div>
  )
}

// ─── Individual Attendance View (Staff Role) ──────────────────────────────────

function MyAttendancePage() {
  const appUser = useAuthStore(s => s.appUser)
  const searchParams = useSearchParams()
  const targetDateParam = searchParams.get('date')

  const [viewDate, setViewDate] = useState<Date>(() => {
    if (targetDateParam) {
      const parsed = new Date(targetDateParam + 'T00:00:00')
      if (!isNaN(parsed.getTime())) return parsed
    }
    return new Date()
  })

  // Sync viewDate if date query parameter changes
  const [prevTargetParam, setPrevTargetParam] = useState(targetDateParam)
  if (targetDateParam !== prevTargetParam) {
    setPrevTargetParam(targetDateParam)
    if (targetDateParam) {
      const parsed = new Date(targetDateParam + 'T00:00:00')
      if (!isNaN(parsed.getTime())) {
        setViewDate(parsed)
      }
    }
  }

  const year = viewDate.getFullYear()
  const month = viewDate.getMonth() + 1

  const [timeLogs, setTimeLogs] = useState<TimeLog[]>([])
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([])
  const [loading, setLoading] = useState(true)

  const [now, setNow] = useState<Date>(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  const [applyOpen, setApplyOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const { backSwipeHandlers } = useBackSwipe()

  useEffect(() => {
    if (!appUser?.uid) return
    let active = true
    getMonthTimeLogs(appUser.uid, year, month)
      .then(logs => {
        if (!active) return
        setTimeLogs(logs)
        setLoading(false)
      })
      .catch(err => {
        if (!active) return
        console.error('[attendance] getMonthTimeLogs error:', err)
        setLoading(false)
      })
    return () => { active = false }
  }, [appUser?.uid, year, month])

  useEffect(() => {
    if (!appUser?.uid) return
    const unsub = subscribeToMyLeaveRequests(appUser.uid, year, month, setLeaveRequests)
    return () => unsub()
  }, [appUser?.uid, year, month])

  const daysInMonth = getDaysInMonth(new Date(year, month - 1))
  const dayNumbers = Array.from({ length: daysInMonth }, (_, i) => i + 1)
  const logsByDate = useMemo(() => groupByDate(timeLogs), [timeLogs])
  const firstDayOffset = new Date(year, month - 1, 1).getDay()
  const [selectedDayStr, setSelectedDayStr] = useState<string>(() => getTodayDateString())

  const leaveByDate = useMemo(() => {
    const map: Record<string, LeaveRequest> = {}
    for (const r of leaveRequests) {
      if (r.status === 'approved') map[r.date] = r
    }
    return map
  }, [leaveRequests])

  const dayData = useMemo(() => {
    const monthStr = String(month).padStart(2, '0')
    return dayNumbers.map(day => {
      const dayStr = `${year}-${monthStr}-${String(day).padStart(2, '0')}`
      const sessions = logsByDate[dayStr] ?? []
      const approved = Boolean(leaveByDate[dayStr])
      const status = computeDayStatus(sessions, dayStr, now, approved)
      const minutes = dayTotalMinutes(sessions, now, dayStr)

      return { day, dayStr, status, minutes }
    })
  }, [dayNumbers, logsByDate, leaveByDate, now, year, month])

  const activeSelectedDay = useMemo(() => {
    return dayData.find(d => d.dayStr === selectedDayStr) ?? dayData[dayData.length - 1] ?? null
  }, [dayData, selectedDayStr])

  const summary = useMemo(() => {
    let P = 0,
      L = 0,
      H = 0,
      LV = 0,
      AB = 0
    for (const { status } of dayData) {
      if (status === 'P') P++
      if (status === 'L') L++
      if (status === 'H') H++
      if (status === 'LV') LV++
      if (status === 'AB') AB++
    }
    return { P, L, H, LV, AB }
  }, [dayData])

  const appUid = appUser?.uid
  const handleSubmit = useCallback(
    async (date: string, type: LeaveRequestType, reason: string) => {
      if (!appUid) return
      setSubmitting(true)
      setSubmitError('')
      try {
        await submitLeaveRequest(appUid, date, type, reason)
        setApplyOpen(false)
      } catch (err) {
        setSubmitError(err instanceof Error ? err.message : 'Submission failed. Please try again.')
      } finally {
        setSubmitting(false)
      }
    },
    [appUid]
  )

  if (!appUser) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '50vh',
          color: 'var(--color-foreground-muted)',
          fontFamily: 'var(--font-inter)',
          fontSize: 'var(--text-sm)',
        }}
      >
        <i className="ti ti-lock" style={{ fontSize: '24px', marginRight: '10px' }} />
        Please sign in to view your attendance.
      </div>
    )
  }

  const TH: React.CSSProperties = {
    fontSize: 'var(--text-xs)',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    color: 'var(--color-foreground-subtle)',
    padding: '12px 4px',
    borderBottom: '0.5px solid var(--color-border-strong)',
    whiteSpace: 'nowrap',
    fontFamily: 'var(--font-inter)',
  }

  const TD: React.CSSProperties = {
    padding: '8px 2px',
    height: '44px',
    borderBottom: '0.5px solid var(--color-border)',
    verticalAlign: 'middle',
    fontFamily: 'var(--font-inter)',
  }

  return (
    <div
      className="p-3.5 sm:p-6 md:p-8 max-w-[1280px] mx-auto flex flex-col gap-4 sm:gap-5"
      style={{
        fontFamily: 'var(--font-inter)',
        color: 'var(--color-foreground)',
      }}
    >
      {/* ─── Header: Month Navigator + Legend + Apply ─── */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 sm:gap-4">
        {/* Month Selector + Mobile Apply button */}
        <div className="flex items-center justify-between sm:justify-start gap-2.5">
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              background: 'var(--color-surface)',
              border: '0.5px solid var(--color-border)',
              borderRadius: '10px',
              padding: '4px 12px',
              height: '38px',
            }}
          >
            <button
              id="att-prev-month"
              onClick={() => setViewDate(d => subMonths(d, 1))}
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--color-foreground-muted)',
                display: 'flex',
                alignItems: 'center',
                padding: 0,
              }}
            >
              <i className="ti ti-chevron-left" style={{ fontSize: '16px' }} />
            </button>

            <span
              style={{
                fontSize: 'var(--text-sm)',
                fontWeight: 600,
                minWidth: '110px',
                textAlign: 'center',
                color: 'var(--color-foreground)',
              }}
            >
              {format(viewDate, 'MMMM yyyy')}
            </span>

            <button
              id="att-next-month"
              onClick={() => setViewDate(d => addMonths(d, 1))}
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--color-foreground-muted)',
                display: 'flex',
                alignItems: 'center',
                padding: 0,
              }}
            >
              <i className="ti ti-chevron-right" style={{ fontSize: '16px' }} />
            </button>
          </div>

          <button
            id="att-apply-btn-mobile"
            className="flex sm:hidden items-center justify-center h-[38px] px-4 rounded-full text-xs font-semibold text-white bg-[var(--color-primary)] cursor-pointer"
            onClick={() => {
              setSubmitError('')
              setApplyOpen(true)
            }}
          >
            Apply
          </button>
        </div>

        {/* Legend + Desktop Apply */}
        <div className="flex items-center justify-between sm:justify-end gap-3 flex-wrap">
          <div className="flex items-center gap-2.5 sm:gap-3.5 flex-wrap">
            {[
              { label: 'Present', color: 'var(--color-success)' },
              { label: 'Late', color: 'var(--color-secondary)' },
              { label: 'Half day', color: 'var(--color-accent)' },
              { label: 'Absent', color: 'var(--color-danger)' },
              { label: 'Leave', color: 'var(--color-purple)' },
            ].map(({ label, color }) => (
              <div key={label} className="flex items-center gap-1.5">
                <span
                  style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '2px',
                    background: color,
                    display: 'inline-block',
                  }}
                />
                <span className="text-[11px] sm:text-xs text-[var(--color-foreground-muted)]">
                  {label}
                </span>
              </div>
            ))}
          </div>

          <button
            id="att-apply-btn-desktop"
            className="hidden sm:flex items-center justify-center h-9 px-5 rounded-full text-xs font-semibold text-white bg-[var(--color-primary)] cursor-pointer"
            onClick={() => {
              setSubmitError('')
              setApplyOpen(true)
            }}
          >
            Apply
          </button>
        </div>
      </div>

      {/* ─── MOBILE VIEW (< 768px): CALENDAR TYPE VIEW FOR STAFF ALONE ─── */}
      <div className="block md:hidden space-y-4" {...backSwipeHandlers} style={{ paddingBottom: '80px' }}>
        {/* Calendar Card */}
        <div
          style={{
            background: 'var(--color-surface)',
            border: '0.5px solid var(--color-border)',
            borderRadius: '16px',
            padding: '14px 10px',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
          }}
        >
          {/* Weekday Row */}
          <div className="grid grid-cols-7 gap-1 mb-2 text-center">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
              <span
                key={d}
                className="text-[10px] font-semibold text-[var(--color-foreground-subtle)] uppercase tracking-wider py-1"
              >
                {d}
              </span>
            ))}
          </div>

          {/* Month Days 7-column Grid */}
          <div className="grid grid-cols-7 gap-1">
            {/* Blank offset cells for previous month padding */}
            {Array.from({ length: firstDayOffset }).map((_, i) => (
              <div key={`offset-${i}`} className="min-h-[52px] rounded-xl bg-transparent opacity-0 pointer-events-none" />
            ))}

            {/* Days in Month */}
            {dayData.map(({ day, dayStr, status }) => {
              const isToday = dayStr === getTodayDateString()
              const isSelected = activeSelectedDay?.dayStr === dayStr

              return (
                <button
                  type="button"
                  key={day}
                  onClick={() => setSelectedDayStr(dayStr)}
                  className={`min-h-[52px] p-1 rounded-xl flex flex-col items-center justify-between transition-all cursor-pointer ${
                    isSelected
                      ? 'border-2 border-[var(--color-primary)] bg-[var(--color-primary-muted)] shadow-sm'
                      : isToday
                      ? 'border border-[var(--color-primary)] bg-[var(--color-surface-raised)]'
                      : 'border border-[var(--color-border)] bg-[var(--color-surface-raised)] hover:bg-[var(--color-surface-overlay)]'
                  }`}
                >
                  <span
                    className={`text-xs font-semibold flex items-center justify-center w-5 h-5 rounded-full ${
                      isToday ? 'bg-[var(--color-primary)] text-white' : 'text-[var(--color-foreground)]'
                    }`}
                  >
                    {day}
                  </span>

                  {status && CALENDAR_STATUS_STYLE[status] ? (
                    <span
                      style={{
                        background: CALENDAR_STATUS_STYLE[status].bg,
                        color: CALENDAR_STATUS_STYLE[status].color,
                      }}
                      className="text-[9px] font-bold px-1.5 py-0.5 rounded leading-none"
                    >
                      {CALENDAR_STATUS_STYLE[status].label}
                    </span>
                  ) : (
                    <span className="text-[10px] text-[var(--color-foreground-subtle)] leading-none mb-0.5">·</span>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* Selected Day Details Card */}
        {activeSelectedDay && (
          <div
            style={{
              background: 'var(--color-surface)',
              border: '0.5px solid var(--color-border)',
              borderRadius: '14px',
              padding: '16px',
            }}
          >
            <div className="flex items-center justify-between pb-3 border-b border-[var(--color-border)]">
              <div>
                <div className="text-[11px] text-[var(--color-foreground-muted)] uppercase tracking-wider font-semibold">
                  Selected Day
                </div>
                <div className="text-sm font-bold text-[var(--color-foreground)] mt-0.5">
                  {format(new Date(year, month - 1, activeSelectedDay.day), 'EEEE, d MMMM yyyy')}
                </div>
              </div>
              <div>
                {activeSelectedDay.status ? (
                  <Badge
                    variant={STATUS_VARIANT[activeSelectedDay.status] ?? 'notIn'}
                    label={STATUS_LABEL[activeSelectedDay.status] ?? activeSelectedDay.status}
                  />
                ) : (
                  <span className="text-xs text-[var(--color-foreground-muted)]">No logs</span>
                )}
              </div>
            </div>

            <div className="pt-3 space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-[var(--color-foreground-muted)]">Worked Duration</span>
                <span className="font-semibold text-[var(--color-foreground)]">
                  {activeSelectedDay.minutes > 0
                    ? `${Math.floor(activeSelectedDay.minutes / 60)}h ${activeSelectedDay.minutes % 60}m`
                    : '—'}
                </span>
              </div>

              {/* Session list for the day */}
              {logsByDate[activeSelectedDay.dayStr]?.length ? (
                <div className="pt-2 border-t border-[var(--color-border)] space-y-1.5">
                  <div className="text-[11px] font-semibold uppercase text-[var(--color-foreground-subtle)] tracking-wider">
                    Sessions Logged
                  </div>
                  {logsByDate[activeSelectedDay.dayStr].map((sess, idx) => (
                    <div
                      key={sess.logId || idx}
                      className="flex items-center justify-between p-2 rounded-lg bg-[var(--color-surface-raised)] border border-[var(--color-border)] text-xs"
                    >
                      <div className="flex items-center gap-1.5">
                        <i className="ti ti-clock-hour-4 text-xs text-[var(--color-primary)]" />
                        <span className="font-semibold">{formatTime12h(sess.checkInAt)}</span>
                        <i className="ti ti-arrow-right text-[10px] text-[var(--color-foreground-subtle)]" />
                        <span>{sess.checkOutAt ? formatTime12h(sess.checkOutAt) : 'In progress'}</span>
                      </div>
                      <span className="text-[11px] font-medium text-[var(--color-foreground-muted)]">
                        {sess.workedMinutes != null
                          ? `${Math.floor(sess.workedMinutes / 60)}h ${sess.workedMinutes % 60}m`
                          : 'Active'}
                      </span>
                    </div>
                  ))}
                </div>
              ) : activeSelectedDay.status === 'LV' ? (
                <div className="text-xs text-[var(--color-purple)] bg-[var(--color-purple-muted)] p-2.5 rounded-lg border border-[var(--color-purple)]">
                  Approved Leave Request
                </div>
              ) : activeSelectedDay.status === 'AB' ? (
                <div className="text-xs text-[var(--color-danger)] bg-[var(--color-danger-muted)] p-2.5 rounded-lg border border-[var(--color-danger)]">
                  Marked Absent — No check-in records for this workday
                </div>
              ) : (
                <div className="text-xs text-[var(--color-foreground-muted)] italic">
                  No timeclock sessions recorded for this day
                </div>
              )}
            </div>
          </div>
        )}

        {/* Monthly Summary Statistics Cards (5-item Grid) */}
        <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
          <div className="py-2.5 px-1 sm:p-3 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] text-center flex flex-col items-center gap-1 min-w-0">
            <span className="text-[9px] sm:text-[10px] font-semibold text-[var(--color-success)] uppercase tracking-wider truncate w-full">Present</span>
            <span className="text-sm sm:text-base font-bold text-[var(--color-foreground)]">{summary.P}</span>
          </div>
          <div className="py-2.5 px-1 sm:p-3 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] text-center flex flex-col items-center gap-1 min-w-0">
            <span className="text-[9px] sm:text-[10px] font-semibold text-[var(--color-secondary)] uppercase tracking-wider truncate w-full">Late</span>
            <span className="text-sm sm:text-base font-bold text-[var(--color-foreground)]">{summary.L}</span>
          </div>
          <div className="py-2.5 px-1 sm:p-3 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] text-center flex flex-col items-center gap-1 min-w-0">
            <span className="text-[9px] sm:text-[10px] font-semibold text-[var(--color-accent)] uppercase tracking-wider truncate w-full">Half Day</span>
            <span className="text-sm sm:text-base font-bold text-[var(--color-foreground)]">{summary.H}</span>
          </div>
          <div className="py-2.5 px-1 sm:p-3 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] text-center flex flex-col items-center gap-1 min-w-0">
            <span className="text-[9px] sm:text-[10px] font-semibold text-[var(--color-purple)] uppercase tracking-wider truncate w-full">Leave</span>
            <span className="text-sm sm:text-base font-bold text-[var(--color-foreground)]">{summary.LV}</span>
          </div>
          <div className="py-2.5 px-1 sm:p-3 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] text-center flex flex-col items-center gap-1 min-w-0">
            <span className="text-[9px] sm:text-[10px] font-semibold text-[var(--color-danger)] uppercase tracking-wider truncate w-full">Absent</span>
            <span className="text-sm sm:text-base font-bold text-[var(--color-foreground)]">{summary.AB}</span>
          </div>
        </div>
      </div>

      {/* ─── DESKTOP VIEW (≥ 768px): ORIGINAL SPREADSHEET TABLE VIEW ─── */}
      <div
        className="hidden md:block"
        style={{
          background: 'var(--color-surface)',
          border: '0.5px solid var(--color-border)',
          borderRadius: '12px',
          overflow: 'hidden',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
        }}
      >
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-sm)', tableLayout: 'auto' }}>
            <thead>
              <tr style={{ background: 'var(--color-surface-raised)' }}>
                <th style={{ ...TH, textAlign: 'left', paddingLeft: '16px' }}>STAFF</th>
                {dayNumbers.map(d => (
                  <th key={d} style={{ ...TH, textAlign: 'center', padding: '12px 2px' }}>
                    {d}
                  </th>
                ))}
                <th style={{ ...TH, textAlign: 'center', color: 'var(--color-success)', padding: '12px 4px' }}>P</th>
                <th style={{ ...TH, textAlign: 'center', color: 'var(--color-secondary)', padding: '12px 4px' }}>L</th>
                <th style={{ ...TH, textAlign: 'center', color: 'var(--color-danger)', padding: '12px 4px', paddingRight: '16px' }}>AB</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <TableRowSkeleton rows={1} cols={dayNumbers.length + 4} />
              ) : (
                <tr>
                  <td
                    style={{
                      ...TD,
                      paddingLeft: '16px',
                      fontWeight: 700,
                      fontSize: 'var(--text-sm)',
                      color: 'var(--color-foreground)',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {appUser.name || 'Staff Member'}
                  </td>

                  {dayData.map(({ day, dayStr, status }) => {
                    const isTargetDate = targetDateParam === dayStr
                    return (
                      <td
                        key={day}
                        style={{
                          ...TD,
                          textAlign: 'center',
                          padding: '2px 1px',
                          background: isTargetDate ? 'var(--color-primary-muted)' : undefined,
                          outline: isTargetDate ? '1.5px solid var(--color-primary)' : undefined,
                          borderRadius: isTargetDate ? '4px' : undefined,
                        }}
                      >
                        {status ? (
                          <Badge
                            variant={STATUS_VARIANT[status] ?? 'notIn'}
                            label={STATUS_LABEL[status] ?? status}
                          />
                        ) : (
                          <span style={{ color: 'var(--color-foreground-subtle)', fontSize: '12px' }}>·</span>
                        )}
                      </td>
                    )
                  })}

                  <td
                    style={{
                      ...TD,
                      textAlign: 'center',
                      fontWeight: 700,
                      fontSize: 'var(--text-sm)',
                      color: 'var(--color-success)',
                      padding: '0 4px',
                    }}
                  >
                    {summary.P}
                  </td>
                  <td
                    style={{
                      ...TD,
                      textAlign: 'center',
                      fontWeight: 700,
                      fontSize: 'var(--text-sm)',
                      color: 'var(--color-secondary)',
                      padding: '0 4px',
                    }}
                  >
                    {summary.L}
                  </td>
                  <td
                    style={{
                      ...TD,
                      textAlign: 'center',
                      fontWeight: 700,
                      fontSize: 'var(--text-sm)',
                      color: 'var(--color-danger)',
                      padding: '0 4px',
                      paddingRight: '16px',
                    }}
                  >
                    {summary.AB}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <ApplyPopup
        open={applyOpen}
        onClose={() => setApplyOpen(false)}
        onSubmit={handleSubmit}
        submitting={submitting}
        submitError={submitError}
      />
    </div>
  )
}

// ─── Main Page Component ───────────────────────────────────────────────────────

export default function AttendancePage() {
  const appUser = useAuthStore(s => s.appUser)

  if (!appUser) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '50vh',
          color: 'var(--color-foreground-muted)',
          fontFamily: 'var(--font-inter)',
          fontSize: 'var(--text-sm)',
        }}
      >
        <i className="ti ti-lock" style={{ fontSize: '24px', marginRight: '10px' }} />
        Please sign in to view attendance.
      </div>
    )
  }

  // Admin and Manager roles see Team Attendance View; Staff sees individual view
  if (appUser.role === 'admin' || appUser.role === 'manager') {
    return <TeamAttendanceView />
  }

  return <MyAttendancePage />
}
