'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { format, addMonths, subMonths, getDaysInMonth } from 'date-fns'
import { useAuthStore } from '@/store/authStore'
import { DateField } from '@/components/shared/DateField'
import { ConfirmModal } from '@/components/shared/ConfirmModal'
import { Badge } from '@/components/shared/Badge'
import { TableRowSkeleton } from '@/components/shared/LoadingSkeleton'
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
  onSubmit: (date: string, type: LeaveRequestType) => void
  submitting: boolean
  submitError: string
}

function ApplyPopup({ open, onClose, onSubmit, submitting, submitError }: ApplyPopupProps) {
  const [applyDate, setApplyDate] = useState(getTodayDateString())
  const applyType: LeaveRequestType = 'leave'
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [prevOpen, setPrevOpen] = useState(open)

  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) {
      setApplyDate(getTodayDateString())
      setConfirmOpen(false)
    }
  }

  if (!open) return null

  const handleApplyClick = () => setConfirmOpen(true)
  const handleConfirm = () => onSubmit(applyDate, applyType)
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
        }}
      >
        <div
          onClick={e => e.stopPropagation()}
          style={{
            width: '380px',
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
  const [viewDate, setViewDate] = useState<Date>(() => new Date())
  const year = viewDate.getFullYear()
  const month = viewDate.getMonth() + 1

  // Filter state
  const [selectedStaffUid, setSelectedStaffUid] = useState<string>('all')

  // Data State
  const [staffList, setStaffList] = useState<StaffMember[]>([])
  const [attendanceMap, setAttendanceMap] = useState<Record<string, AttendanceRecord>>({})
  const [monthLogsMap, setMonthLogsMap] = useState<Record<string, TimeLog[]>>({})
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([])
  const [loading, setLoading] = useState(true)

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

        const rawDocStatus = attRecord?.dailyStatus?.[day] || attRecord?.dailyStatus?.[String(day)]

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
      style={{
        fontFamily: 'var(--font-inter)',
        color: 'var(--color-foreground)',
        padding: '24px',
        maxWidth: '1280px',
        margin: '0 auto',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
      }}
    >
      {/* ── Top Bar Controls ─────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
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
  )
}

// ─── Individual Attendance View (Staff Role) ──────────────────────────────────

function MyAttendancePage() {
  const appUser = useAuthStore(s => s.appUser)

  const [viewDate, setViewDate] = useState<Date>(() => new Date())
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

  const summary = useMemo(() => {
    let P = 0,
      L = 0,
      H = 0,
      LV = 0,
      AB = 0,
      totalMinutes = 0
    for (const { status, minutes } of dayData) {
      if (status === 'P') {
        P++
        totalMinutes += minutes
      }
      if (status === 'L') {
        L++
        totalMinutes += minutes
      }
      if (status === 'H') {
        H++
        totalMinutes += minutes
      }
      if (status === 'LV') {
        LV++
      }
      if (status === 'AB') {
        AB++
      }
    }
    const h = Math.floor(totalMinutes / 60)
    const totalHours = `${h}h`
    return { P, L, H, LV, AB, totalHours }
  }, [dayData])

  const appUid = appUser?.uid
  const handleSubmit = useCallback(
    async (date: string, type: LeaveRequestType) => {
      if (!appUid) return
      setSubmitting(true)
      setSubmitError('')
      try {
        await submitLeaveRequest(appUid, date, type)
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
      style={{
        fontFamily: 'var(--font-inter)',
        color: 'var(--color-foreground)',
        padding: '24px',
        maxWidth: '1280px',
        margin: '0 auto',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
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

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
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

          <button
            id="att-apply-btn"
            onClick={() => {
              setSubmitError('')
              setApplyOpen(true)
            }}
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
              justifyContent: 'center',
              transition: 'opacity 0.15s',
            }}
          >
            Apply
          </button>
        </div>
      </div>

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
                <th style={{ ...TH, textAlign: 'left', paddingLeft: '16px' }}>STAFF</th>
                {dayNumbers.map(d => (
                  <th key={d} style={{ ...TH, textAlign: 'center', padding: '12px 2px' }}>
                    {d}
                  </th>
                ))}
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
                <TableRowSkeleton rows={1} cols={dayNumbers.length + 5} />
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

                  {dayData.map(({ day, status }) => (
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
                    }}
                  >
                    {summary.AB}
                  </td>
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
                    {summary.totalHours}
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
