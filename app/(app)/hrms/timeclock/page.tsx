'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { format } from 'date-fns'
import { Badge } from '@/components/shared/Badge'
import { TableRowSkeleton } from '@/components/shared/LoadingSkeleton'
import { useAuthStore } from '@/store/authStore'
import { useBackSwipe } from '@/hooks/useMobileGestures'
import {
  subscribeToTodayTimeLogs,
  subscribeToAllTodayTimeLogs,
  checkIn,
  checkOut,
  getTodayDateString,
  formatTime12h,
  formatDuration,
  formatWorkedMinutes,
  STANDARD_MINUTES,
} from '@/lib/firebase/queries/timeLogs'
import { subscribeToStaffOnly, type StaffMember } from '@/lib/firebase/queries/staff'
import type { TimeLog } from '@/types'

// ─── Constants & Helpers ───────────────────────────────────────────────────────

function formatClock12h(date: Date): string {
  let h = date.getHours()
  const mm = String(date.getMinutes()).padStart(2, '0')
  const ss = String(date.getSeconds()).padStart(2, '0')
  const ampm = h >= 12 ? 'PM' : 'AM'
  h = h % 12 || 12
  return `${String(h).padStart(2, '0')}:${mm}:${ss} ${ampm}`
}

function formatDateLabel(date: Date): string {
  return format(date, 'EEEE, d MMMM yyyy')
}

function getInitials(name: string): string {
  if (!name) return 'SZ'
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

/** Compute total completed seconds from closed sessions */
function completedSeconds(sessions: TimeLog[]): number {
  return sessions
    .filter(s => s.status === 'closed' && s.workedMinutes != null)
    .reduce((sum, s) => sum + (s.workedMinutes ?? 0) * 60, 0)
}

/** Format VS 9H with sign prefix */
function formatVs9h(totalSeconds: number): string {
  const std = STANDARD_MINUTES * 60
  const diff = totalSeconds - std
  const abs = Math.abs(diff)
  const h = Math.floor(abs / 3600)
  const m = Math.floor((abs % 3600) / 60)
  const label = h > 0 ? `${h}h ${m}m` : `${m}m`
  if (diff >= 0) return `+${label}`
  return `-${label}`
}

/** Duration between two Dates in human format */
function sessionDuration(checkInAt: Date, checkOutAt: Date): string {
  const secs = Math.max(0, Math.floor((checkOutAt.getTime() - checkInAt.getTime()) / 1000))
  return formatDuration(secs)
}

/** Running seconds for an open session */
function runningSessionSeconds(checkInAt: Date, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - checkInAt.getTime()) / 1000))
}

// ─── Team Time Clock View (Admin & Manager) ───────────────────────────────────

function TeamTimeClockView() {
  const [now, setNow] = useState<Date>(() => new Date())
  const [staffList, setStaffList] = useState<StaffMember[]>([])
  const [allLogs, setAllLogs] = useState<TimeLog[]>([])
  const [loadingStaff, setLoadingStaff] = useState(true)
  const [loadingLogs, setLoadingLogs] = useState(true)

  const todayStr = getTodayDateString()

  // 1-second live clock tick
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  // Subscribe to staff members ONLY (role === 'staff')
  useEffect(() => {
    const unsub = subscribeToStaffOnly(list => {
      setStaffList(list.filter(s => s.isActive !== false))
      setLoadingStaff(false)
    })
    return () => unsub()
  }, [])

  // Subscribe to today's logs across all staff
  useEffect(() => {
    const unsub = subscribeToAllTodayTimeLogs(todayStr, logs => {
      setAllLogs(logs)
      setLoadingLogs(false)
    })
    return () => unsub()
  }, [todayStr])

  // Group logs by staffUid
  const logsByStaff = useMemo(() => {
    const map: Record<string, TimeLog[]> = {}
    for (const log of allLogs) {
      if (!map[log.staffUid]) map[log.staffUid] = []
      map[log.staffUid].push(log)
    }
    return map
  }, [allLogs])

  // Process rows for each staff member
  const rows = useMemo(() => {
    return staffList.map(staff => {
      const logs = logsByStaff[staff.uid] ?? []
      const firstLog = logs.length > 0 ? logs[0] : null
      const lastSession = logs.length > 0 ? logs[logs.length - 1] : null

      let status: 'in' | 'late' | 'notIn' = 'notIn'
      let checkInDisplay = '—'
      let checkOutDisplay = '—'

      if (firstLog) {
        if (firstLog.overrideStatus === 'Not in') {
          status = 'notIn'
        } else if (firstLog.overrideStatus === 'Late') {
          status = 'late'
          checkInDisplay = formatTime12h(firstLog.checkInAt)
        } else if (firstLog.overrideStatus === 'In') {
          status = 'in'
          checkInDisplay = formatTime12h(firstLog.checkInAt)
        } else {
          // Automatic rule if no manual override
          const checkInMins = firstLog.checkInAt.getHours() * 60 + firstLog.checkInAt.getMinutes()
          status = checkInMins > 570 ? 'late' : 'in' // > 9:30 AM is Late
          checkInDisplay = formatTime12h(firstLog.checkInAt)
        }
      }

      if (lastSession && lastSession.checkOutAt) {
        checkOutDisplay = formatTime12h(lastSession.checkOutAt)
      }

      // Calculate total worked minutes today
      const closedMinutes = logs
        .filter(s => s.status === 'closed' && s.workedMinutes != null)
        .reduce((sum, s) => sum + (s.workedMinutes ?? 0), 0)

      const openSession = logs.find(s => s.status === 'open')
      const runningMinutes = openSession
        ? Math.max(0, Math.floor((now.getTime() - openSession.checkInAt.getTime()) / 60000))
        : 0

      const totalMinutes = closedMinutes + runningMinutes
      const hoursSoFarDisplay = totalMinutes > 0 ? formatWorkedMinutes(totalMinutes) : '0h'

      return {
        staff,
        status,
        checkInDisplay,
        checkOutDisplay,
        hoursSoFarDisplay,
      }
    })
  }, [staffList, logsByStaff, now])

  // Mobile Search and Status Filter States
  const [mobileSearch, setMobileSearch] = useState('')
  const [mobileStatusFilter, setMobileStatusFilter] = useState<'all' | 'in' | 'late' | 'notIn'>('all')
  const { backSwipeHandlers } = useBackSwipe()

  const filteredRows = useMemo(() => {
    return rows.filter(r => {
      if (mobileStatusFilter !== 'all' && r.status !== mobileStatusFilter) return false
      if (mobileSearch.trim()) {
        const query = mobileSearch.trim().toLowerCase()
        if (!r.staff.name.toLowerCase().includes(query)) return false
      }
      return true
    })
  }, [rows, mobileStatusFilter, mobileSearch])

  // Summary counts (only staff roles)
  const onTimeCount = useMemo(() => {
    return rows.filter(r => r.status === 'in').length
  }, [rows])

  const totalStaffCount = staffList.length

  const isLoading = loadingStaff || loadingLogs

  const TH: React.CSSProperties = {
    fontSize: 'var(--text-xs)',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: 'var(--color-foreground-subtle)',
    padding: '14px 20px',
    borderBottom: '0.5px solid var(--color-border-strong)',
    fontFamily: 'var(--font-inter)',
  }

  const TD: React.CSSProperties = {
    padding: '14px 20px',
    height: '52px',
    borderBottom: '0.5px solid var(--color-border)',
    verticalAlign: 'middle',
    fontFamily: 'var(--font-inter)',
  }

  return (
    <div
      className="p-3.5 sm:p-6 md:p-8 max-w-[1280px] mx-auto flex flex-col gap-4 sm:gap-6 w-full"
      style={{
        fontFamily: 'var(--font-inter)',
        color: 'var(--color-foreground)',
      }}
    >
      {/* ── DESKTOP VIEW (≥768px): 100% Invariant ── */}
      <div className="hidden md:flex md:flex-col gap-6">
        {/* Top Header Section */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '20px' }}>
          <div>
            <h1
              style={{
                fontSize: 'var(--text-2xl)',
                fontWeight: 700,
                letterSpacing: '-0.02em',
                margin: 0,
                color: 'var(--color-foreground)',
              }}
            >
              Team time clock · today
            </h1>
            <div
              style={{
                fontSize: 'var(--text-sm)',
                color: 'var(--color-foreground-muted)',
                marginTop: '4px',
              }}
            >
              {formatDateLabel(now)} ·{' '}
              <span style={{ color: 'var(--color-foreground-muted)', fontWeight: 500 }}>
                {onTimeCount} of {totalStaffCount} checked in
              </span>
            </div>
          </div>

          {/* Live Digital Clock */}
          <div
            style={{
              fontSize: '2.2rem',
              fontWeight: 700,
              letterSpacing: '-0.02em',
              color: 'var(--color-foreground)',
              fontFamily: 'var(--font-inter)',
              lineHeight: 1,
              paddingTop: '4px',
            }}
          >
            {formatClock12h(now)}
          </div>
        </div>

        {/* Data Grid Card */}
        <div
          style={{
            background: 'var(--color-surface)',
            border: '0.5px solid var(--color-border)',
            borderRadius: '16px',
            overflow: 'hidden',
            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.15)',
          }}
        >
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-sm)' }}>
              <thead>
                <tr style={{ background: 'transparent' }}>
                  <th style={{ ...TH, textAlign: 'left', width: '25%' }}>STAFF</th>
                  <th style={{ ...TH, textAlign: 'left', width: '18%' }}>STATUS</th>
                  <th style={{ ...TH, textAlign: 'left', width: '18%' }}>CHECK-IN</th>
                  <th style={{ ...TH, textAlign: 'left', width: '18%' }}>CHECK-OUT</th>
                  <th style={{ ...TH, textAlign: 'left', width: '21%' }}>HOURS SO FAR</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <TableRowSkeleton rows={5} cols={5} />
                ) : rows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      style={{
                        ...TD,
                        textAlign: 'center',
                        color: 'var(--color-foreground-subtle)',
                        padding: '32px',
                      }}
                    >
                      No staff members found.
                    </td>
                  </tr>
                ) : (
                  rows.map(row => (
                    <tr
                      key={row.staff.uid}
                      style={{
                        transition: 'background 0.15s ease',
                      }}
                    >
                      {/* STAFF */}
                      <td style={{ ...TD, textAlign: 'left' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <div
                            style={{
                              width: '32px',
                              height: '32px',
                              borderRadius: '50%',
                              background: 'var(--color-primary-muted)',
                              color: 'var(--color-primary)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: 'var(--text-xs)',
                              fontWeight: 700,
                              flexShrink: 0,
                            }}
                          >
                            {getInitials(row.staff.name)}
                          </div>
                          <span style={{ fontWeight: 600, color: 'var(--color-foreground)' }}>
                            {row.staff.name}
                          </span>
                        </div>
                      </td>

                      {/* STATUS */}
                      <td style={{ ...TD, textAlign: 'left' }}>
                        <Badge variant={row.status} label={row.status === 'in' ? 'In' : row.status === 'late' ? 'Late' : 'Not in'} />
                      </td>

                      {/* CHECK-IN */}
                      <td style={{ ...TD, textAlign: 'left', color: 'var(--color-foreground)' }}>
                        {row.checkInDisplay}
                      </td>

                      {/* CHECK-OUT */}
                      <td style={{ ...TD, textAlign: 'left', color: 'var(--color-foreground)' }}>
                        {row.checkOutDisplay}
                      </td>

                      {/* HOURS SO FAR */}
                      <td style={{ ...TD, textAlign: 'left', fontWeight: 600, color: 'var(--color-foreground)' }}>
                        {row.hoursSoFarDisplay}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ── MOBILE VIEW (<768px): Responsive Cards & Live Clock Hero ── */}
      <div className="flex md:hidden flex-col gap-3.5 pb-24" {...backSwipeHandlers}>
        {/* Live Digital Clock Hero Card */}
        <div
          style={{
            background: 'var(--color-surface)',
            border: '0.5px solid var(--color-border)',
            borderRadius: '16px',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            boxShadow: '0 2px 10px rgba(0, 0, 0, 0.1)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
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
                Team Time Clock
              </span>
              <span
                style={{
                  fontSize: 'var(--text-xs)',
                  color: 'var(--color-foreground-muted)',
                  marginTop: '2px',
                }}
              >
                {formatDateLabel(now)}
              </span>
            </div>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 10px',
                borderRadius: '12px',
                background: 'var(--color-primary-muted)',
                color: 'var(--color-primary)',
                fontSize: 'var(--text-xs)',
                fontWeight: 600,
              }}
            >
              <span
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  background: 'var(--color-primary)',
                  display: 'inline-block',
                }}
              />
              <span>{onTimeCount} / {totalStaffCount} Checked In</span>
            </div>
          </div>

          <div
            style={{
              fontSize: '2.2rem',
              fontWeight: 700,
              letterSpacing: '-0.03em',
              color: 'var(--color-foreground)',
              fontFamily: 'var(--font-inter)',
              lineHeight: 1,
              textAlign: 'center',
              padding: '6px 0',
            }}
          >
            {formatClock12h(now)}
          </div>
        </div>

        {/* Search & Quick Filter Pills */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {/* Search Input */}
          <div style={{ position: 'relative' }}>
            <i
              className="ti ti-search"
              style={{
                fontSize: '15px',
                color: 'var(--color-foreground-subtle)',
                position: 'absolute',
                left: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                pointerEvents: 'none',
              }}
            />
            <input
              type="text"
              value={mobileSearch}
              onChange={e => setMobileSearch(e.target.value)}
              placeholder="Search team member..."
              style={{
                fontFamily: 'var(--font-inter)',
                width: '100%',
                height: '38px',
                background: 'var(--color-surface)',
                border: '0.5px solid var(--color-border)',
                borderRadius: '10px',
                padding: '0 12px 0 34px',
                fontSize: 'var(--text-sm)',
                color: 'var(--color-foreground)',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Status Filter Chips */}
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
              { id: 'all', label: `All (${rows.length})` },
              { id: 'in', label: `In (${rows.filter(r => r.status === 'in').length})` },
              { id: 'late', label: `Late (${rows.filter(r => r.status === 'late').length})` },
              { id: 'notIn', label: `Not In (${rows.filter(r => r.status === 'notIn').length})` },
            ].map(tab => {
              const active = mobileStatusFilter === tab.id
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setMobileStatusFilter(tab.id as 'all' | 'in' | 'late' | 'notIn')}
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
        </div>

        {/* Staff Mobile Cards List */}
        {isLoading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {[1, 2, 3, 4].map(k => (
              <div
                key={k}
                style={{
                  height: '110px',
                  background: 'var(--color-surface)',
                  borderRadius: '12px',
                  border: '0.5px solid var(--color-border)',
                }}
              />
            ))}
          </div>
        ) : filteredRows.length === 0 ? (
          <div
            style={{
              background: 'var(--color-surface)',
              borderRadius: '12px',
              border: '0.5px solid var(--color-border)',
              padding: '36px 16px',
              textAlign: 'center',
              color: 'var(--color-foreground-muted)',
              fontSize: 'var(--text-sm)',
            }}
          >
            No team members found matching your search.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {filteredRows.map(row => {
              const borderLeftColor =
                row.status === 'in'
                  ? 'var(--color-success)'
                  : row.status === 'late'
                  ? 'var(--color-secondary)'
                  : 'var(--color-border)'

              return (
                <div
                  key={row.staff.uid}
                  style={{
                    background: 'var(--color-surface)',
                    border: '0.5px solid var(--color-border)',
                    borderLeft: `3px solid ${borderLeftColor}`,
                    borderRadius: '12px',
                    padding: '12px 14px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                  }}
                >
                  {/* Header: Avatar, Name & Status */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                      <div
                        style={{
                          width: '32px',
                          height: '32px',
                          borderRadius: '50%',
                          background: 'var(--color-primary-muted)',
                          color: 'var(--color-primary)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 'var(--text-xs)',
                          fontWeight: 700,
                          flexShrink: 0,
                        }}
                      >
                        {getInitials(row.staff.name)}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div
                          style={{
                            fontWeight: 600,
                            fontSize: 'var(--text-sm)',
                            color: 'var(--color-foreground)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {row.staff.name}
                        </div>
                      </div>
                    </div>
                    <Badge variant={row.status} label={row.status === 'in' ? 'In' : row.status === 'late' ? 'Late' : 'Not in'} />
                  </div>

                  {/* 3-Column Metrics Grid */}
                  <div
                    style={{
                      background: 'var(--color-surface-raised)',
                      borderRadius: '8px',
                      padding: '8px 10px',
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr 1fr',
                      gap: '4px',
                      alignItems: 'center',
                      textAlign: 'center',
                    }}
                  >
                    <div>
                      <span
                        style={{
                          fontSize: '10px',
                          fontWeight: 600,
                          textTransform: 'uppercase',
                          letterSpacing: '0.04em',
                          color: 'var(--color-foreground-subtle)',
                          display: 'block',
                        }}
                      >
                        Check-In
                      </span>
                      <span
                        style={{
                          fontSize: 'var(--text-xs)',
                          fontWeight: 600,
                          color: 'var(--color-foreground)',
                        }}
                      >
                        {row.checkInDisplay}
                      </span>
                    </div>

                    <div style={{ borderLeft: '0.5px solid var(--color-border)', borderRight: '0.5px solid var(--color-border)' }}>
                      <span
                        style={{
                          fontSize: '10px',
                          fontWeight: 600,
                          textTransform: 'uppercase',
                          letterSpacing: '0.04em',
                          color: 'var(--color-foreground-subtle)',
                          display: 'block',
                        }}
                      >
                        Check-Out
                      </span>
                      <span
                        style={{
                          fontSize: 'var(--text-xs)',
                          fontWeight: 600,
                          color: 'var(--color-foreground)',
                        }}
                      >
                        {row.checkOutDisplay}
                      </span>
                    </div>

                    <div>
                      <span
                        style={{
                          fontSize: '10px',
                          fontWeight: 600,
                          textTransform: 'uppercase',
                          letterSpacing: '0.04em',
                          color: 'var(--color-foreground-subtle)',
                          display: 'block',
                        }}
                      >
                        Hours
                      </span>
                      <span
                        style={{
                          fontSize: 'var(--text-xs)',
                          fontWeight: 700,
                          color: 'var(--color-primary)',
                        }}
                      >
                        {row.hoursSoFarDisplay}
                      </span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Individual Time Clock View (Staff Role) ──────────────────────────────────

function IndividualTimeClockView({ appUid }: { appUid: string }) {
  const { backSwipeHandlers } = useBackSwipe()
  const [now, setNow] = useState<Date>(() => new Date())
  const [sessions, setSessions] = useState<TimeLog[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [actionError, setActionError] = useState('')

  const todayRef = useRef(getTodayDateString())

  useEffect(() => {
    const id = setInterval(() => {
      const n = new Date()
      const newDate = getTodayDateString()
      if (newDate !== todayRef.current) {
        todayRef.current = newDate
      }
      setNow(n)
    }, 1000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (!appUid) return
    const unsub = subscribeToTodayTimeLogs(appUid, todayRef.current, data => {
      setSessions(data)
      setLoading(false)
    })
    return () => unsub()
  }, [appUid])

  const openSession = sessions.find(s => s.status === 'open') ?? null
  const isCheckedIn = openSession !== null
  const firstSession = sessions.length > 0 ? sessions[0] : null
  const closedSecs = completedSeconds(sessions)
  const runningSecs = openSession ? runningSessionSeconds(openSession.checkInAt, now) : 0
  const totalSecs = closedSecs + runningSecs
  const vsNegative = totalSecs < STANDARD_MINUTES * 60

  const handleCheckIn = useCallback(async () => {
    if (!appUid || isCheckedIn || actionLoading) return
    setActionLoading(true)
    setActionError('')
    try {
      await checkIn(appUid)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Check-in failed. Please try again.')
    } finally {
      setActionLoading(false)
    }
  }, [appUid, isCheckedIn, actionLoading])

  const handleCheckOut = useCallback(async () => {
    if (!appUid || !isCheckedIn || actionLoading) return
    setActionLoading(true)
    setActionError('')
    try {
      await checkOut(appUid)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Check-out failed. Please try again.')
    } finally {
      setActionLoading(false)
    }
  }, [appUid, isCheckedIn, actionLoading])

  return (
    <div
      className="flex flex-col items-center gap-5 p-3.5 sm:p-6 md:p-8 w-full pb-28 md:pb-8"
      style={{
        fontFamily: 'var(--font-inter)',
        color: 'var(--color-foreground)',
      }}
      {...backSwipeHandlers}
    >
      <div
        className="w-full max-w-[480px] p-5 sm:p-7 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] flex flex-col gap-5 shadow-sm"
      >
        {/* Status header badge */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 12px',
              borderRadius: '20px',
              background: isCheckedIn ? 'var(--color-success-muted)' : 'var(--color-surface-raised)',
              border: `0.5px solid ${isCheckedIn ? 'var(--color-success)' : 'var(--color-border)'}`,
              color: isCheckedIn ? 'var(--color-success)' : 'var(--color-foreground-muted)',
              fontSize: 'var(--text-xs)',
              fontWeight: 600,
            }}
          >
            <span
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: isCheckedIn ? 'var(--color-success)' : 'var(--color-foreground-subtle)',
                display: 'inline-block',
              }}
            />
            <span>{isCheckedIn ? 'Clocked In · Active Session' : 'Not Clocked In'}</span>
          </div>
        </div>

        <div style={{ textAlign: 'center' }}>
          <div
            style={{
              fontSize: 'clamp(2.2rem, 7vw, 2.8rem)',
              fontWeight: 700,
              letterSpacing: '-0.03em',
              color: 'var(--color-foreground)',
              lineHeight: 1.1,
            }}
          >
            {formatClock12h(now)}
          </div>
          <div
            style={{
              fontSize: 'var(--text-sm)',
              color: 'var(--color-foreground-muted)',
              marginTop: '6px',
            }}
          >
            {formatDateLabel(now)}
          </div>
        </div>

        {actionError && (
          <div
            style={{
              fontSize: 'var(--text-xs)',
              color: 'var(--color-danger)',
              background: 'var(--color-danger-muted)',
              border: '0.5px solid var(--color-danger)',
              borderRadius: '8px',
              padding: '8px 12px',
              textAlign: 'center',
            }}
          >
            {actionError}
          </div>
        )}

        <button
          id="timeclock-action-btn"
          disabled={actionLoading || loading}
          onClick={isCheckedIn ? handleCheckOut : handleCheckIn}
          style={{
            height: '50px',
            width: '100%',
            borderRadius: '12px',
            border: 'none',
            cursor: actionLoading || loading ? 'not-allowed' : 'pointer',
            fontSize: 'var(--text-base)',
            fontWeight: 600,
            fontFamily: 'var(--font-inter)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            opacity: actionLoading || loading ? 0.7 : 1,
            transition: 'opacity 0.15s ease, transform 0.1s ease',
            background: isCheckedIn ? 'var(--color-danger)' : 'var(--color-success)',
            color: '#ffffff',
            boxShadow: isCheckedIn
              ? '0 4px 14px rgba(239, 83, 80, 0.25)'
              : '0 4px 14px rgba(76, 175, 80, 0.25)',
          }}
        >
          <i
            className={isCheckedIn ? 'ti ti-clock-out' : 'ti ti-clock-in'}
            style={{ fontSize: '20px' }}
          />
          {actionLoading
            ? isCheckedIn
              ? 'Checking out…'
              : 'Checking in…'
            : isCheckedIn
            ? 'Check Out'
            : 'Check In'}
        </button>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
            borderTop: '0.5px solid var(--color-border)',
            paddingTop: '16px',
            alignItems: 'center',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'center', textAlign: 'center', padding: '0 2px' }}>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                color: 'var(--color-foreground-subtle)',
                whiteSpace: 'nowrap',
              }}
            >
              Check-In
            </span>
            <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-foreground)', whiteSpace: 'nowrap' }}>
              {firstSession ? formatTime12h(firstSession.checkInAt) : '—'}
            </span>
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
              alignItems: 'center',
              textAlign: 'center',
              padding: '0 2px',
              borderLeft: '0.5px solid var(--color-border)',
              borderRight: '0.5px solid var(--color-border)',
            }}
          >
            <span
              style={{
                fontSize: '11px',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                color: 'var(--color-foreground-subtle)',
                whiteSpace: 'nowrap',
              }}
            >
              Hours Today
            </span>
            <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-foreground)', whiteSpace: 'nowrap' }}>
              {formatDuration(totalSecs)}
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'center', textAlign: 'center', padding: '0 2px' }}>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                color: 'var(--color-foreground-subtle)',
                whiteSpace: 'nowrap',
              }}
            >
              VS 9H
            </span>
            <span
              style={{
                fontSize: 'var(--text-sm)',
                fontWeight: 700,
                color: vsNegative ? 'var(--color-secondary)' : 'var(--color-success)',
                whiteSpace: 'nowrap',
              }}
            >
              {formatVs9h(totalSecs)}
            </span>
          </div>
        </div>
      </div>

      {sessions.length > 0 && (
        <div
          style={{
            width: '100%',
            maxWidth: '480px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          <div
            style={{
              fontSize: 'var(--text-xs)',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color: 'var(--color-foreground-subtle)',
              paddingLeft: '4px',
            }}
          >
            Today&apos;s Log
          </div>

          <div
            style={{
              background: 'var(--color-surface)',
              border: '0.5px solid var(--color-border)',
              borderRadius: '12px',
              overflow: 'hidden',
            }}
          >
            {sessions.map((session, idx) => {
              const isOpen = session.status === 'open'
              const runSecs = isOpen ? runningSessionSeconds(session.checkInAt, now) : 0
              const displayDuration = isOpen
                ? `${formatDuration(runSecs)} so far`
                : session.checkOutAt
                ? sessionDuration(session.checkInAt, session.checkOutAt)
                : '—'

              return (
                <div
                  key={session.logId}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '12px 14px',
                    borderBottom: idx < sessions.length - 1 ? '0.5px solid var(--color-border)' : 'none',
                  }}
                >
                  <i
                    className="ti ti-clock-hour-4"
                    style={{
                      fontSize: '16px',
                      color: isOpen ? 'var(--color-success)' : 'var(--color-foreground-subtle)',
                      flexShrink: 0,
                    }}
                  />
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0 }}>
                    <span
                      style={{
                        fontSize: 'var(--text-sm)',
                        fontWeight: 600,
                        color: 'var(--color-foreground)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {formatTime12h(session.checkInAt)}
                    </span>
                    <i
                      className="ti ti-arrow-right"
                      style={{ fontSize: '11px', color: 'var(--color-foreground-subtle)', flexShrink: 0 }}
                    />
                    {isOpen ? (
                      <Badge variant="active" label="Active" />
                    ) : (
                      <span style={{ fontSize: 'var(--text-sm)', fontWeight: 500, color: 'var(--color-foreground-muted)', whiteSpace: 'nowrap' }}>
                        {session.checkOutAt ? formatTime12h(session.checkOutAt) : '—'}
                      </span>
                    )}
                  </div>
                  <span
                    style={{
                      fontSize: 'var(--text-xs)',
                      fontWeight: 500,
                      color: 'var(--color-foreground-muted)',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {displayDuration}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {!loading && sessions.length === 0 && (
        <div
          style={{
            width: '100%',
            maxWidth: '480px',
            textAlign: 'center',
            padding: '24px 16px',
            color: 'var(--color-foreground-subtle)',
            fontSize: 'var(--text-sm)',
            background: 'var(--color-surface)',
            border: '0.5px solid var(--color-border)',
            borderRadius: '12px',
          }}
        >
          <i className="ti ti-clock-pause" style={{ fontSize: '24px', display: 'block', marginBottom: '8px' }} />
          No sessions recorded today. Punch in to start tracking your time.
        </div>
      )}
    </div>
  )
}

// ─── Main Route Component ─────────────────────────────────────────────────────

export default function TimeClockPage() {
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
        Please sign in to access Time Clock.
      </div>
    )
  }

  // Admin & Manager see Team Time Clock; Staff sees individual check-in/out view
  if (appUser.role === 'admin' || appUser.role === 'manager') {
    return <TeamTimeClockView />
  }

  return <IndividualTimeClockView appUid={appUser.uid} />
}
