'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { format } from 'date-fns'
import { Badge } from '@/components/shared/Badge'
import { TableRowSkeleton } from '@/components/shared/LoadingSkeleton'
import { useAuthStore } from '@/store/authStore'
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
      className="w-full px-4 py-4 sm:px-8 sm:py-6 max-w-[1280px] mx-auto flex flex-col gap-6"
      style={{
        fontFamily: 'var(--font-inter)',
        color: 'var(--color-foreground)',
      }}
    >
      {/* ── Top Header Section ─────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-5 w-full">
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
          className="text-2xl sm:text-3xl font-bold tracking-tight text-[var(--color-foreground)] text-left sm:text-right pt-1"
          style={{
            fontFamily: 'var(--font-inter)',
            lineHeight: 1,
          }}
        >
          {formatClock12h(now)}
        </div>
      </div>

      {/* ── Data Grid Card ──────────────────────────────────────────────── */}
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
  )
}

// ─── Individual Time Clock View (Staff Role) ──────────────────────────────────

function IndividualTimeClockView({ appUid }: { appUid: string }) {
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
      className="w-full px-3 py-4 sm:px-6 sm:py-8 flex flex-col items-center gap-5"
      style={{
        fontFamily: 'var(--font-inter)',
        color: 'var(--color-foreground)',
      }}
    >
      <div
        className="w-full max-w-[480px] p-4 sm:p-7 rounded-2xl flex flex-col gap-5"
        style={{
          background: 'var(--color-surface)',
          border: '0.5px solid var(--color-border)',
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <div
            className="text-3xl sm:text-4xl font-bold tracking-tight text-[var(--color-foreground)] leading-tight"
          >
            {formatClock12h(now)}
          </div>
          <div
            style={{
              fontSize: 'var(--text-sm)',
              color: 'var(--color-foreground-muted)',
              marginTop: '4px',
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
            height: '48px',
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
            transition: 'opacity 0.15s ease, background 0.2s ease',
            background: isCheckedIn ? 'var(--color-danger)' : 'var(--color-success)',
            color: '#ffffff',
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
            width: '100%',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'center', textAlign: 'center', width: '100%' }}>
            <span
              style={{
                fontSize: 'var(--text-xs)',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                color: 'var(--color-foreground-subtle)',
                textAlign: 'center',
                width: '100%',
                display: 'block',
              }}
            >
              Check-In
            </span>
            <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-foreground)', textAlign: 'center', width: '100%', display: 'block' }}>
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
              width: '100%',
              borderLeft: '0.5px solid var(--color-border)',
              borderRight: '0.5px solid var(--color-border)',
            }}
          >
            <span
              style={{
                fontSize: 'var(--text-xs)',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                color: 'var(--color-foreground-subtle)',
                textAlign: 'center',
                width: '100%',
                display: 'block',
              }}
            >
              Hours Today
            </span>
            <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-foreground)', textAlign: 'center', width: '100%', display: 'block' }}>
              {formatDuration(totalSecs)}
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'center', textAlign: 'center', width: '100%' }}>
            <span
              style={{
                fontSize: 'var(--text-xs)',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                color: 'var(--color-foreground-subtle)',
                textAlign: 'center',
                width: '100%',
                display: 'block',
              }}
            >
              VS 9H
            </span>
            <span
              style={{
                fontSize: 'var(--text-sm)',
                fontWeight: 700,
                color: vsNegative ? 'var(--color-secondary)' : 'var(--color-success)',
                textAlign: 'center',
                width: '100%',
                display: 'block',
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
                    padding: '12px 16px',
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
                  <span
                    style={{
                      fontSize: 'var(--text-sm)',
                      fontWeight: 600,
                      color: 'var(--color-foreground)',
                      minWidth: '72px',
                    }}
                  >
                    {formatTime12h(session.checkInAt)}
                  </span>
                  <i
                    className="ti ti-arrow-right"
                    style={{ fontSize: '12px', color: 'var(--color-foreground-subtle)', flexShrink: 0 }}
                  />
                  <div style={{ flex: 1 }}>
                    {isOpen ? (
                      <Badge variant="active" label="Active" />
                    ) : (
                      <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-foreground-muted)' }}>
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
            padding: '24px 0 8px',
            color: 'var(--color-foreground-subtle)',
            fontSize: 'var(--text-sm)',
          }}
        >
          No sessions recorded today. Check in to start tracking.
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
