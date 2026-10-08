'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import {
  format,
  startOfMonth,
  getDaysInMonth,
  addMonths,
  subMonths,
  startOfWeek,
  endOfWeek,
  addWeeks,
  subWeeks,
  eachDayOfInterval,
} from 'date-fns'
import { subscribeToProjects } from '@/lib/firebase/queries/projects'
import { subscribeToClients } from '@/lib/firebase/queries/clients'
import { subscribeToStaff } from '@/lib/firebase/queries/staff'
import { useUIStore } from '@/store/uiStore'
import { Project, Client, ProjectStage } from '@/types'
import { type StaffMember } from '@/lib/firebase/queries/staff'
import { computeRecurringSessionDates } from '@/lib/utils/dates'
import { useBackSwipe } from '@/hooks/useMobileGestures'

// ─── Stage Styling & Labels ──────────────────────────────────────────────────

const STAGE_CONFIG: Record<string, { label: string; bg: string; fg: string }> = {
  booked:         { label: 'Booked',     bg: 'var(--color-accent-muted)',    fg: 'var(--color-accent)' },
  planning:       { label: 'Planning',   bg: 'var(--color-primary-muted)',   fg: 'var(--color-primary)' },
  preProduction:  { label: 'Pre-Prod',   bg: 'var(--color-secondary-muted)', fg: 'var(--color-secondary)' },
  eventDay:       { label: 'Event Day',  bg: 'var(--color-danger-muted)',    fg: 'var(--color-danger)' },
  postProduction: { label: 'Post-Prod',  bg: 'var(--color-purple-muted)',    fg: 'var(--color-purple)' },
  delivered:      { label: 'Delivered',  bg: 'var(--color-success-muted)',   fg: 'var(--color-success)' },
}

function getStageConfig(stage?: string) {
  if (!stage) return STAGE_CONFIG.booked
  return STAGE_CONFIG[stage] || STAGE_CONFIG.booked
}

function getEventTypeIcon(type?: string): string {
  const t = (type || '').toLowerCase()
  if (['wedding', 'engagement', 'reception', 'babyshower', 'birthday', 'puberty'].includes(t)) {
    return 'ti-heart'
  }
  if (['corporate', 'schoolevent'].includes(t)) {
    return 'ti-building-factory-2'
  }
  return 'ti-camera'
}

function getInitials(name?: string): string {
  if (!name) return 'SZ'
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

// ─── Calendar Event Model ───────────────────────────────────────────────────

interface CalendarEventItem {
  id: string
  clientId?: string
  projectId?: string
  name: string
  clientName: string
  eventType: string
  stage: string
  dateStr: string       // "YYYY-MM-DD"
  startTime?: string
  endTime?: string
  location?: string
  callTime?: string
  team: Array<{ name: string; init: string }>
}

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

// ─── Calendar View Component ─────────────────────────────────────────────────

export default function CalendarPage() {
  const router = useRouter()
  const testDatasetMode = useUIStore(s => s.testDatasetMode)
  const testModeCutoff = useUIStore(s => s.testModeCutoff)
  const [currentDate, setCurrentDate] = useState<Date>(new Date())
  const [selectedDateStr, setSelectedDateStr] = useState<string>(format(new Date(), 'yyyy-MM-dd'))
  const [viewMode, setViewMode] = useState<'month' | 'week'>('month')

  const [projects, setProjects] = useState<Project[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [staffList, setStaffList] = useState<StaffMember[]>([])

  // Subscriptions with clean unmount cleanup
  useEffect(() => {
    const unsubProj = subscribeToProjects(data => setProjects(data || []))
    const unsubClients = subscribeToClients({}, data => setClients(data || []))
    const unsubStaff = subscribeToStaff(data => setStaffList(data || []))

    return () => {
      unsubProj()
      unsubClients()
      unsubStaff()
    }
  }, [testDatasetMode, testModeCutoff])

  // Staff map for initials and full names lookup
  const staffMap = useMemo(() => {
    const map = new Map<string, string>()
    staffList.forEach(s => {
      if (s?.uid && s?.name) map.set(s.uid, s.name)
    })
    return map
  }, [staffList])

  // Clients lookup map by clientId
  const clientMap = useMemo(() => {
    const map = new Map<string, Client>()
    clients.forEach(c => {
      if (c?.clientId) map.set(c.clientId, c)
    })
    return map
  }, [clients])

  // Aggregate all events & functions by date string "YYYY-MM-DD"
  const eventsByDay = useMemo(() => {
    const map: Record<string, CalendarEventItem[]> = {}

    const addEvent = (item: CalendarEventItem) => {
      if (!item || !item.dateStr) return
      if (!map[item.dateStr]) {
        map[item.dateStr] = []
      }

      // Avoid duplicate entries by ID or by same project/client/session on the same date
      const existingIdx = map[item.dateStr].findIndex(e => {
        if (e.id === item.id) return true

        const itemSessionMatch = item.id.match(/-(?:session|func)-(.+)$/)
        const eSessionMatch = e.id.match(/-(?:session|func)-(.+)$/)
        if (itemSessionMatch && eSessionMatch && itemSessionMatch[1] === eSessionMatch[1]) {
          if ((item.projectId && e.projectId && item.projectId === e.projectId) ||
              (item.clientId && e.clientId && item.clientId === e.clientId)) {
            return true
          }
        }

        const isMainItem = !itemSessionMatch
        const isMainE = !eSessionMatch
        if (isMainItem && isMainE) {
          if (item.projectId && e.projectId && item.projectId === e.projectId) return true
          if (item.clientId && e.clientId && item.clientId === e.clientId) return true
        }

        // Cross-match: if one is a session/func and the other is a main/parent event of the same client or project,
        // they represent the exact same event on that date
        const sameEntity = (item.clientId && e.clientId && item.clientId === e.clientId) ||
                           (item.projectId && e.projectId && item.projectId === e.projectId)
        if (sameEntity && (itemSessionMatch || eSessionMatch)) {
          return true
        }

        return false
      })

      if (existingIdx !== -1) {
        const existing = map[item.dateStr][existingIdx]
        const itemIsSession = item.id.includes('-session-') || item.id.includes('-func-')
        const existingIsSession = existing.id.includes('-session-') || existing.id.includes('-func-')
        const preferItem = itemIsSession && !existingIsSession

        map[item.dateStr][existingIdx] = {
          ...(preferItem ? item : existing),
          projectId: item.projectId || existing.projectId,
          clientId:  item.clientId || existing.clientId,
          stage:     item.stage || existing.stage,
          team:      item.team && item.team.length > 0 ? item.team : existing.team,
        }
        return
      }

      map[item.dateStr].push(item)
    }

    // Process Clients
    clients.forEach(client => {
      if (!client || !client.clientId) return

      const stage = (client.stage || client.status || 'booked') as ProjectStage
      const teamNames: string[] = []

      if (Array.isArray(client.assignedStaff) && client.assignedStaff.length > 0) {
        teamNames.push(...client.assignedStaff.filter(Boolean))
      } else if (Array.isArray(client.staffUids)) {
        client.staffUids.forEach(uid => {
          if (!uid) return
          const name = staffMap.get(uid)
          if (name && !teamNames.includes(name)) teamNames.push(name)
        })
      }

      const team = teamNames.map(n => ({ name: n, init: getInitials(n) }))

      // 1. Recurring schedule: for legacy clients without discrete projects, expand sessions
      if (client.bookingType === 'recurring') {
        if ((!Array.isArray(client.projectIds) || client.projectIds.length === 0) && client.recurringSchedule) {
          const rs = client.recurringSchedule
          const sessions = computeRecurringSessionDates(
            rs.frequency || 'weekly',
            rs.startDate,
            rs.totalSessions || 1,
            rs.sessionStartTime || client.startTime || '09:00',
            rs.sessionEndTime || client.endTime || '18:00'
          )

          sessions.forEach(sess => {
            addEvent({
              id: `client-${client.clientId}-session-${sess.sessionNumber}`,
              clientId: client.clientId,
              projectId: client.projectId,
              name: `${client.eventName || client.name || 'Untitled Event'} — ${sess.label}`,
              clientName: client.name || '',
              eventType: client.eventType || 'other',
              stage,
              dateStr: sess.dateStr,
              startTime: sess.startTime,
              endTime: sess.endTime,
              location: client.location || '',
              callTime: sess.startTime,
              team,
            })
          })
        }
        // If client has discrete projects in client.projectIds, projects.forEach handles them below.
        // Never fall through to primary event date for recurring bookings!
      } else if (client.bookingType === 'multiDate') {
        if (Array.isArray(client.eventDates) && client.eventDates.length > 0) {
          client.eventDates.forEach((ed, idx) => {
            if (!ed || !ed.date) return
            const d = ed.date instanceof Date ? ed.date : new Date(ed.date)
            if (!isNaN(d.getTime())) {
              const dateStr = format(d, 'yyyy-MM-dd')
              addEvent({
                id: `client-${client.clientId}-func-${ed.id || idx}`,
                clientId: client.clientId,
                projectId: client.projectId,
                name: `${client.name || 'Client'} — ${ed.label || 'Function'}`,
                clientName: client.name || '',
                eventType: client.eventType || 'other',
                stage,
                dateStr,
                startTime: ed?.startTime || client?.startTime || '09:00',
                endTime: ed?.endTime || client?.endTime || '18:00',
                location: ed?.location || client?.location || '',
                callTime: ed?.startTime || client?.startTime,
                team,
              })
            }
          })
        }
      } else if (client.eventDate) {
        // 3. Primary event date (for oneTime bookings)
        const d = client.eventDate instanceof Date ? client.eventDate : new Date(client.eventDate)
        if (!isNaN(d.getTime())) {
          const dateStr = format(d, 'yyyy-MM-dd')
          addEvent({
            id: `client-${client.clientId}-main`,
            clientId: client.clientId,
            projectId: client.projectId,
            name: client.eventName || client.name || 'Untitled Event',
            clientName: client.name || '',
            eventType: client.eventType || 'other',
            stage,
            dateStr,
            startTime: client.startTime || '09:00',
            endTime: client.endTime || '18:00',
            location: client.location || '',
            callTime: client.startTime ? `${client.startTime}` : undefined,
            team,
          })
        }
      }
    })

    // Process Projects (if any separate projects exist)
    projects.forEach(proj => {
      if (!proj || !proj.projectId) return
      const client = proj.clientId ? clientMap.get(proj.clientId) : undefined
      const stage = (proj.stage || client?.stage || 'booked') as ProjectStage
      const teamNames: string[] = []

      if (Array.isArray(proj.staffUids)) {
        proj.staffUids.forEach(uid => {
          if (!uid) return
          const name = staffMap.get(uid)
          if (name && !teamNames.includes(name)) teamNames.push(name)
        })
      }

      const team = teamNames.length > 0
        ? teamNames.map(n => ({ name: n, init: getInitials(n) }))
        : (client?.assignedStaff || []).map(n => ({ name: n, init: getInitials(n) }))

      // 1. Discrete recurring session project
      if (proj.sessionIndex) {
        const d = proj.eventDate instanceof Date ? proj.eventDate : new Date(proj.eventDate)
        if (!isNaN(d.getTime())) {
          const dateStr = format(d, 'yyyy-MM-dd')
          addEvent({
            id: `proj-${proj.projectId}-session-${proj.sessionIndex}`,
            clientId: proj.clientId,
            projectId: proj.projectId,
            name: proj.eventName || `${proj.clientName || client?.name || 'Untitled'} — Session ${proj.sessionIndex}`,
            clientName: proj.clientName || client?.name || '',
            eventType: proj.eventType || client?.eventType || 'other',
            stage,
            dateStr,
            startTime: proj.startTime || client?.startTime || '09:00',
            endTime: proj.endTime || client?.endTime || '18:00',
            location: client?.location || '',
            callTime: proj.callTime || proj.startTime,
            team,
          })
        }
      } else if (proj.bookingType === 'recurring') {
        // Legacy monolithic recurring project fallback (only if no sessionIndex)
        if (proj.recurringSchedule) {
          const rs = proj.recurringSchedule
          const sessions = computeRecurringSessionDates(
            rs.frequency || 'weekly',
            rs.startDate,
            rs.totalSessions || 1,
            rs.sessionStartTime || proj.startTime || client?.startTime || '09:00',
            rs.sessionEndTime || proj.endTime || client?.endTime || '18:00'
          )

          sessions.forEach(sess => {
            addEvent({
              id: `proj-${proj.projectId}-session-${sess.sessionNumber}`,
              clientId: proj.clientId,
              projectId: proj.projectId,
              name: `${proj.eventName || client?.eventName || proj.clientName || 'Untitled Project'} — ${sess.label}`,
              clientName: proj.clientName || client?.name || '',
              eventType: proj.eventType || client?.eventType || 'other',
              stage,
              dateStr: sess.dateStr,
              startTime: sess.startTime,
              endTime: sess.endTime,
              location: client?.location || '',
              callTime: proj.callTime || sess.startTime,
              team,
            })
          })
        }
      } else if (proj.bookingType === 'multiDate' && Array.isArray(proj.eventDates) && proj.eventDates.length > 0) {
        // 2. Multi-date on project
        proj.eventDates.forEach((ed, idx) => {
          if (!ed || !ed.date) return
          const d = ed.date instanceof Date ? ed.date : new Date(ed.date)
          if (!isNaN(d.getTime())) {
            const dateStr = format(d, 'yyyy-MM-dd')
            addEvent({
              id: `proj-${proj.projectId}-func-${ed.id || idx}`,
              clientId: proj.clientId,
              projectId: proj.projectId,
              name: `${proj.clientName || client?.name || 'Client'} — ${ed.label || 'Function'}`,
              clientName: proj.clientName || client?.name || '',
              eventType: proj.eventType || client?.eventType || 'other',
              stage,
              dateStr,
              startTime: ed?.startTime || proj?.startTime || client?.startTime || '09:00',
              endTime: ed?.endTime || proj?.endTime || client?.endTime || '18:00',
              location: ed?.location || client?.location || '',
              callTime: ed?.startTime || proj?.callTime,
              team,
            })
          }
        })
      } else if (proj.eventDate) {
        // 3. Primary event date (for oneTime projects)
        const d = proj.eventDate instanceof Date ? proj.eventDate : new Date(proj.eventDate)
        if (!isNaN(d.getTime())) {
          const dateStr = format(d, 'yyyy-MM-dd')
          addEvent({
            id: `proj-${proj.projectId}`,
            clientId: proj.clientId,
            projectId: proj.projectId,
            name: proj.eventName || client?.eventName || proj.clientName || 'Untitled Project',
            clientName: proj.clientName || client?.name || '',
            eventType: proj.eventType || client?.eventType || 'other',
            stage,
            dateStr,
            startTime: proj.startTime || client?.startTime || '09:00',
            endTime: proj.endTime || client?.endTime || '18:00',
            location: client?.location || '',
            callTime: proj.callTime || client?.startTime,
            team,
          })
        }
      }
    })

    return map
  }, [clients, projects, staffMap, clientMap])

  // Navigation handlers for Month & Week views
  const handlePrev = () => {
    if (viewMode === 'month') {
      setCurrentDate(prev => subMonths(prev, 1))
    } else {
      setCurrentDate(prev => subWeeks(prev, 1))
    }
  }

  const handleNext = () => {
    if (viewMode === 'month') {
      setCurrentDate(prev => addMonths(prev, 1))
    } else {
      setCurrentDate(prev => addWeeks(prev, 1))
    }
  }

  const handleToday = () => {
    const today = new Date()
    setCurrentDate(today)
    setSelectedDateStr(format(today, 'yyyy-MM-dd'))
  }

  // ─── Calculate Month Grid ──────────────────────────────────────────────────
  const calendarMonthCells = useMemo(() => {
    const monthStart = startOfMonth(currentDate)
    const daysInMonth = getDaysInMonth(currentDate)
    const todayStr = format(new Date(), 'yyyy-MM-dd')

    // Monday=0, Tuesday=1, ..., Sunday=6
    const startDayOfWeek = (monthStart.getDay() + 6) % 7

    const cells: Array<{
      dateStr: string
      dayNumber: number
      isCurrentMonth: boolean
      isToday: boolean
      isSelected: boolean
      events: CalendarEventItem[]
    }> = []

    // 1. Previous month padding days
    const prevMonthDate = subMonths(currentDate, 1)
    const prevMonthDays = getDaysInMonth(prevMonthDate)
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      const dayNum = prevMonthDays - i
      const d = new Date(prevMonthDate.getFullYear(), prevMonthDate.getMonth(), dayNum)
      const dStr = format(d, 'yyyy-MM-dd')
      cells.push({
        dateStr: dStr,
        dayNumber: dayNum,
        isCurrentMonth: false,
        isToday: dStr === todayStr,
        isSelected: dStr === selectedDateStr,
        events: eventsByDay[dStr] || [],
      })
    }

    // 2. Current month days
    for (let dayNum = 1; dayNum <= daysInMonth; dayNum++) {
      const d = new Date(currentDate.getFullYear(), currentDate.getMonth(), dayNum)
      const dStr = format(d, 'yyyy-MM-dd')
      cells.push({
        dateStr: dStr,
        dayNumber: dayNum,
        isCurrentMonth: true,
        isToday: dStr === todayStr,
        isSelected: dStr === selectedDateStr,
        events: eventsByDay[dStr] || [],
      })
    }

    // 3. Next month padding days
    const totalCellsSoFar = cells.length
    const remainingInGrid = totalCellsSoFar % 7 === 0 ? 0 : 7 - (totalCellsSoFar % 7)
    const nextMonthDate = addMonths(currentDate, 1)

    for (let dayNum = 1; dayNum <= remainingInGrid; dayNum++) {
      const d = new Date(nextMonthDate.getFullYear(), nextMonthDate.getMonth(), dayNum)
      const dStr = format(d, 'yyyy-MM-dd')
      cells.push({
        dateStr: dStr,
        dayNumber: dayNum,
        isCurrentMonth: false,
        isToday: dStr === todayStr,
        isSelected: dStr === selectedDateStr,
        events: eventsByDay[dStr] || [],
      })
    }

    return cells
  }, [currentDate, selectedDateStr, eventsByDay])

  // ─── Calculate Week View Columns ───────────────────────────────────────────
  const weekDays = useMemo(() => {
    const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 })
    const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 })
    const days = eachDayOfInterval({ start: weekStart, end: weekEnd })
    const todayStr = format(new Date(), 'yyyy-MM-dd')

    return days.map(day => {
      const dStr = format(day, 'yyyy-MM-dd')
      return {
        date: day,
        dateStr: dStr,
        dayName: format(day, 'EEE'),
        dayNumber: format(day, 'd'),
        isToday: dStr === todayStr,
        isSelected: dStr === selectedDateStr,
        events: eventsByDay[dStr] || [],
      }
    })
  }, [currentDate, selectedDateStr, eventsByDay])

  // Week header label e.g. "14 – 20 September 2026"
  const weekHeaderLabel = useMemo(() => {
    const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 })
    const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 })
    if (weekStart.getMonth() === weekEnd.getMonth()) {
      return `${format(weekStart, 'd')} – ${format(weekEnd, 'd MMMM yyyy')}`
    }
    return `${format(weekStart, 'd MMM')} – ${format(weekEnd, 'd MMM yyyy')}`
  }, [currentDate])

  // Events for selected day in right detail panel
  const selectedDayEvents = eventsByDay[selectedDateStr] || []
  const selectedDateObj = useMemo(() => {
    if (!selectedDateStr) return new Date()
    const [y, m, d] = selectedDateStr.split('-').map(Number)
    return new Date(y, m - 1, d)
  }, [selectedDateStr])

  const selectedDayHeaderLabel = format(selectedDateObj, 'd MMMM yyyy')

  // ─── Mobile Calendar State & Memos ──────────────────────────────────────────
  const [mobileDrawerEvent, setMobileDrawerEvent] = useState<CalendarEventItem | null>(null)
  const { backSwipeHandlers } = useBackSwipe()

  // Sticky 7-day week glance bar around current week
  const mobileWeekDays = useMemo(() => {
    const start = startOfWeek(currentDate, { weekStartsOn: 1 })
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start)
      d.setDate(start.getDate() + i)
      const dStr = format(d, 'yyyy-MM-dd')
      return {
        date: d,
        dateStr: dStr,
        dayName: format(d, 'EEE'),
        dayNum: format(d, 'd'),
        isToday: dStr === format(new Date(), 'yyyy-MM-dd'),
        isSelected: dStr === selectedDateStr,
        hasEvents: (eventsByDay[dStr] || []).length > 0,
        count: (eventsByDay[dStr] || []).length,
      }
    })
  }, [currentDate, selectedDateStr, eventsByDay])

  // Chronological agenda for active month
  const mobileAgendaDays = useMemo(() => {
    const dates = Object.keys(eventsByDay).sort()
    const monthPrefix = format(currentDate, 'yyyy-MM')
    return dates
      .filter(d => d.startsWith(monthPrefix) && (eventsByDay[d] || []).length > 0)
      .map(d => ({
        dateStr: d,
        dateLabel: format(new Date(d + 'T00:00:00'), 'EEEE, d MMMM'),
        isToday: d === format(new Date(), 'yyyy-MM-dd'),
        isSelected: d === selectedDateStr,
        events: eventsByDay[d] || [],
      }))
  }, [eventsByDay, currentDate, selectedDateStr])

  return (
    <>
      {/* ── DESKTOP VIEW (≥768px): 100% Invariant ── */}
      <div
        className="hidden md:flex"
        style={{
          maxWidth: '1280px',
          margin: '0 auto',
          padding: '24px',
          gap: '16px',
          alignItems: 'start',
          fontFamily: 'var(--font-inter)',
          boxSizing: 'border-box',
          width: '100%',
        }}
      >
      {/* ── Left: Calendar Card ── */}
      <div
        style={{
          flex: 1,
          minWidth: 0,
          background: 'var(--color-surface)',
          border: '0.5px solid var(--color-border)',
          borderRadius: '12px',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Calendar Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '12px 16px',
            borderBottom: '0.5px solid var(--color-border)',
            flexWrap: 'wrap',
          }}
        >
          {/* Navigation Arrows */}
          <div style={{ display: 'flex', gap: '4px' }}>
            <span
              onClick={handlePrev}
              title={viewMode === 'month' ? 'Previous Month' : 'Previous Week'}
              style={{
                width: '28px',
                height: '28px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '6px',
                cursor: 'pointer',
                color: 'var(--color-foreground-muted)',
                transition: 'background 0.15s ease',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-surface-raised)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <i className="ti ti-chevron-left" style={{ fontSize: '16px' }} />
            </span>
            <span
              onClick={handleNext}
              title={viewMode === 'month' ? 'Next Month' : 'Next Week'}
              style={{
                width: '28px',
                height: '28px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '6px',
                cursor: 'pointer',
                color: 'var(--color-foreground-muted)',
                transition: 'background 0.15s ease',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-surface-raised)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <i className="ti ti-chevron-right" style={{ fontSize: '16px' }} />
            </span>
          </div>

          {/* Month / Week Title */}
          <span
            style={{
              fontSize: 'var(--text-lg)',
              fontWeight: 600,
              color: 'var(--color-foreground)',
              letterSpacing: '-0.01em',
            }}
          >
            {viewMode === 'month' ? format(currentDate, 'MMMM yyyy') : weekHeaderLabel}
          </span>

          {/* Today Button */}
          <span
            onClick={handleToday}
            style={{
              fontSize: 'var(--text-xs)',
              fontWeight: 600,
              padding: '3px 10px',
              borderRadius: '8px',
              background: 'var(--color-surface-raised)',
              border: '0.5px solid var(--color-border)',
              color: 'var(--color-foreground)',
              cursor: 'pointer',
              userSelect: 'none',
              transition: 'background 0.15s ease',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-surface-overlay)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'var(--color-surface-raised)')}
          >
            Today
          </span>

          <div style={{ flex: 1 }} />

          {/* Month / Week View Toggle */}
          <div
            style={{
              display: 'flex',
              background: 'var(--color-surface-raised)',
              border: '0.5px solid var(--color-border)',
              borderRadius: '8px',
              padding: '2px',
            }}
          >
            <span
              onClick={() => setViewMode('month')}
              style={{
                fontSize: 'var(--text-xs)',
                fontWeight: 600,
                padding: '4px 12px',
                borderRadius: '6px',
                background: viewMode === 'month' ? 'var(--color-primary)' : 'transparent',
                color: viewMode === 'month' ? '#ffffff' : 'var(--color-foreground-muted)',
                cursor: 'pointer',
                userSelect: 'none',
                transition: 'all 0.15s ease',
              }}
            >
              Month
            </span>
            <span
              onClick={() => setViewMode('week')}
              style={{
                fontSize: 'var(--text-xs)',
                fontWeight: 600,
                padding: '4px 12px',
                borderRadius: '6px',
                background: viewMode === 'week' ? 'var(--color-primary)' : 'transparent',
                color: viewMode === 'week' ? '#ffffff' : 'var(--color-foreground-muted)',
                cursor: 'pointer',
                userSelect: 'none',
                transition: 'all 0.15s ease',
              }}
            >
              Week
            </span>
          </div>
        </div>

        {/* ── Month View Grid ── */}
        {viewMode === 'month' && (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {/* Day-of-week Header Row */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
              }}
            >
              {DAY_NAMES.map(name => (
                <div
                  key={name}
                  style={{
                    padding: '8px 10px',
                    fontSize: 'var(--text-xs)',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    color: 'var(--color-foreground-subtle)',
                    borderBottom: '0.5px solid var(--color-border-strong)',
                  }}
                >
                  {name}
                </div>
              ))}
            </div>

            {/* Day Cells Grid */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
              }}
            >
              {calendarMonthCells.map((cell, idx) => {
                const hasMore = cell.events.length > 2
                const visibleEvents = cell.events.slice(0, 2)
                const moreCount = cell.events.length - 2

                let numColor = 'var(--color-foreground-muted)'
                let numBg = 'transparent'

                if (cell.isToday) {
                  numColor = '#ffffff'
                  numBg = 'var(--color-primary)'
                } else if (!cell.isCurrentMonth) {
                  numColor = 'var(--color-foreground-subtle)'
                }

                return (
                  <div
                    key={`${cell.dateStr}-${idx}`}
                    onClick={() => setSelectedDateStr(cell.dateStr)}
                    style={{
                      minHeight: '86px',
                      borderBottom: '0.5px solid var(--color-border)',
                      borderRight: (idx + 1) % 7 === 0 ? 'none' : '0.5px solid var(--color-border)',
                      padding: '6px 8px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '3px',
                      cursor: 'pointer',
                      background: cell.isSelected ? 'var(--color-primary-muted)' : 'transparent',
                      transition: 'background 0.15s ease',
                      boxSizing: 'border-box',
                      overflow: 'hidden',
                      minWidth: 0,
                    }}
                    onMouseEnter={e => {
                      if (!cell.isSelected) {
                        e.currentTarget.style.background = 'var(--color-surface-raised)'
                      }
                    }}
                    onMouseLeave={e => {
                      if (!cell.isSelected) {
                        e.currentTarget.style.background = 'transparent'
                      }
                    }}
                  >
                    {/* Day Number Header */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                      <span
                        style={{
                          fontSize: 'var(--text-xs)',
                          fontWeight: 600,
                          width: '20px',
                          height: '20px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderRadius: '50%',
                          color: numColor,
                          background: numBg,
                          flexShrink: 0,
                        }}
                      >
                        {cell.dayNumber}
                      </span>
                      {(cell.events.length > 0 || cell.isToday) && (
                        <span
                          onClick={(e) => {
                            e.stopPropagation()
                            setSelectedDateStr(cell.dateStr)
                          }}
                          style={{
                            fontSize: '10px',
                            fontWeight: 600,
                            color: cell.isSelected ? 'var(--color-primary)' : 'var(--color-foreground-muted)',
                            background: cell.isSelected ? 'var(--color-surface-raised)' : 'transparent',
                            padding: '1px 5px',
                            borderRadius: '4px',
                            border: '0.5px solid var(--color-border)',
                            cursor: 'pointer',
                            lineHeight: '14px',
                            transition: 'all 0.15s ease',
                          }}
                          onMouseEnter={e => {
                            e.currentTarget.style.color = 'var(--color-primary)'
                            e.currentTarget.style.borderColor = 'var(--color-primary)'
                          }}
                          onMouseLeave={e => {
                            e.currentTarget.style.color = cell.isSelected ? 'var(--color-primary)' : 'var(--color-foreground-muted)'
                            e.currentTarget.style.borderColor = 'var(--color-border)'
                          }}
                        >
                          View
                        </span>
                      )}
                    </div>

                    {/* Event Chips */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', overflow: 'hidden' }}>
                      {visibleEvents.map(ev => {
                        const stageConf = getStageConfig(ev.stage)
                        const icon = getEventTypeIcon(ev.eventType)

                        return (
                          <div
                            key={ev.id}
                            title={`${ev.name} (${stageConf.label})`}
                            style={{
                              fontSize: '10px',
                              fontWeight: 600,
                              padding: '2px 6px',
                              borderRadius: '5px',
                              background: stageConf.bg,
                              color: stageConf.fg,
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              maxWidth: '100%',
                              boxSizing: 'border-box',
                            }}
                          >
                            <i className={`ti ${icon}`} style={{ fontSize: '11px', flexShrink: 0 }} />
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {ev.name}
                            </span>
                          </div>
                        )
                      })}

                      {hasMore && (
                        <span
                          style={{
                            fontSize: '10px',
                            color: 'var(--color-foreground-subtle)',
                            paddingLeft: '2px',
                            fontWeight: 500,
                          }}
                        >
                          +{moreCount} more
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Week View Grid ── */}
        {viewMode === 'week' && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
              width: '100%',
              minHeight: '360px',
            }}
          >
            {weekDays.map((col, idx) => {
              return (
                <div
                  key={col.dateStr}
                  onClick={() => setSelectedDateStr(col.dateStr)}
                  style={{
                    borderRight: idx === 6 ? 'none' : '0.5px solid var(--color-border)',
                    background: col.isSelected ? 'var(--color-primary-muted)' : 'transparent',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    transition: 'background 0.15s ease',
                    minWidth: 0,
                    overflow: 'hidden',
                    boxSizing: 'border-box',
                  }}
                  onMouseEnter={e => {
                    if (!col.isSelected) e.currentTarget.style.background = 'var(--color-surface-raised)'
                  }}
                  onMouseLeave={e => {
                    if (!col.isSelected) e.currentTarget.style.background = 'transparent'
                  }}
                >
                  {/* Column Header */}
                  <div
                    style={{
                      padding: '8px 6px',
                      borderBottom: '0.5px solid var(--color-border-strong)',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '2px',
                      background: col.isSelected ? 'var(--color-surface-raised)' : 'transparent',
                    }}
                  >
                    <span
                      style={{
                        fontSize: 'var(--text-xs)',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                        color: 'var(--color-foreground-subtle)',
                      }}
                    >
                      {col.dayName}
                    </span>
                    <span
                      style={{
                        fontSize: 'var(--text-sm)',
                        fontWeight: 700,
                        width: '22px',
                        height: '22px',
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: col.isToday ? 'var(--color-primary)' : 'transparent',
                        color: col.isToday ? '#ffffff' : 'var(--color-foreground)',
                      }}
                    >
                      {col.dayNumber}
                    </span>
                    {(col.events.length > 0 || col.isToday) && (
                      <span
                        onClick={(e) => {
                          e.stopPropagation()
                          setSelectedDateStr(col.dateStr)
                        }}
                        style={{
                          fontSize: '10px',
                          fontWeight: 600,
                          color: col.isSelected ? 'var(--color-primary)' : 'var(--color-foreground-muted)',
                          background: col.isSelected ? 'var(--color-surface-raised)' : 'transparent',
                          padding: '1px 5px',
                          borderRadius: '4px',
                          border: '0.5px solid var(--color-border)',
                          cursor: 'pointer',
                          lineHeight: '14px',
                          marginTop: '2px',
                          transition: 'all 0.15s ease',
                        }}
                        onMouseEnter={e => {
                          e.currentTarget.style.color = 'var(--color-primary)'
                          e.currentTarget.style.borderColor = 'var(--color-primary)'
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.color = col.isSelected ? 'var(--color-primary)' : 'var(--color-foreground-muted)'
                          e.currentTarget.style.borderColor = 'var(--color-border)'
                        }}
                      >
                        View
                      </span>
                    )}
                  </div>

                  {/* Day Events Column */}
                  <div
                    style={{
                      padding: '6px 4px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '6px',
                      flex: 1,
                      maxHeight: '400px',
                      overflowY: 'auto',
                    }}
                  >
                    {col.events.length === 0 ? (
                      <div
                        style={{
                          textAlign: 'center',
                          padding: '16px 2px',
                          fontSize: 'var(--text-xs)',
                          color: 'var(--color-foreground-subtle)',
                        }}
                      >
                        No events
                      </div>
                    ) : (
                      col.events.map(ev => {
                        const stageConf = getStageConfig(ev.stage)
                        const icon = getEventTypeIcon(ev.eventType)

                        return (
                          <div
                            key={ev.id}
                            style={{
                              background: 'var(--color-surface-raised)',
                              border: '0.5px solid var(--color-border)',
                              borderRadius: '6px',
                              padding: '8px 6px',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '4px',
                              boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                              minWidth: 0,
                              maxWidth: '100%',
                              boxSizing: 'border-box',
                              overflow: 'hidden',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', overflow: 'hidden' }}>
                              <i className={`ti ${icon}`} style={{ fontSize: '11px', color: stageConf.fg, flexShrink: 0 }} />
                              <span
                                style={{
                                  fontSize: '11px',
                                  fontWeight: 700,
                                  color: 'var(--color-foreground)',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {ev.name}
                              </span>
                            </div>

                            {ev.startTime && (
                              <div
                                style={{
                                  fontSize: '9px',
                                  color: 'var(--color-foreground-muted)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '3px',
                                }}
                              >
                                <i className="ti ti-clock" style={{ fontSize: '10px' }} />
                                {ev.startTime}
                              </div>
                            )}

                            {ev.location && (
                              <div
                                style={{
                                  fontSize: '9px',
                                  color: 'var(--color-foreground-subtle)',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '3px',
                                }}
                              >
                                <i className="ti ti-map-pin" style={{ fontSize: '10px', flexShrink: 0 }} />
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {ev.location}
                                </span>
                              </div>
                            )}

                            <span
                              style={{
                                alignSelf: 'flex-start',
                                fontSize: '8.5px',
                                fontWeight: 600,
                                padding: '2px 5px',
                                borderRadius: '5px',
                                background: stageConf.bg,
                                color: stageConf.fg,
                                marginTop: '1px',
                              }}
                            >
                              {stageConf.label}
                            </span>
                          </div>
                        )
                      })
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Right: Day Detail Panel ── */}
      <div
        style={{
          width: '230px',
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
          position: 'sticky',
          top: '20px',
          maxHeight: 'calc(100vh - 100px)',
        }}
      >
        {/* Selected Date Header */}
        <div
          style={{
            fontSize: 'var(--text-xs)',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            color: 'var(--color-foreground-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexShrink: 0,
            paddingBottom: '2px',
          }}
        >
          <span>{selectedDayHeaderLabel}</span>
          {selectedDayEvents.length > 0 && (
            <span
              style={{
                fontSize: '10px',
                fontWeight: 700,
                color: 'var(--color-primary)',
                background: 'var(--color-primary-muted)',
                padding: '2px 8px',
                borderRadius: '10px',
              }}
            >
              {selectedDayEvents.length}
            </span>
          )}
        </div>

        {/* Scrollable Events List Container */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            overflowY: 'auto',
            paddingRight: '4px',
            flex: 1,
            minHeight: 0,
          }}
        >
          {selectedDayEvents.length === 0 ? (
            <div
              style={{
                padding: '24px 16px',
                fontSize: 'var(--text-xs)',
                color: 'var(--color-foreground-subtle)',
                fontStyle: 'italic',
                background: 'var(--color-surface)',
                border: '0.5px solid var(--color-border)',
                borderRadius: '12px',
                textAlign: 'center',
              }}
            >
              No events scheduled for this day
            </div>
          ) : (
            selectedDayEvents.map(ev => {
              const stageConf = getStageConfig(ev.stage)

              // Construct meta line: "Time · Venue · call time Note"
              const metaParts: string[] = []
              if (ev.startTime) {
                metaParts.push(ev.startTime)
              }
              if (ev.location) {
                metaParts.push(ev.location)
              }
              if (ev.callTime) {
                metaParts.push(`call time ${ev.callTime}`)
              }
              const metaLine = metaParts.join(' · ') || 'No location details'

              return (
                <div
                  key={ev.id}
                  style={{
                    background: 'var(--color-surface)',
                    border: '0.5px solid var(--color-border)',
                    borderRadius: '12px',
                    padding: '14px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                    flexShrink: 0,
                  }}
                >
                  {/* Event Name */}
                  <div
                    style={{
                      fontSize: 'var(--text-sm)',
                      fontWeight: 700,
                      color: 'var(--color-foreground)',
                      lineHeight: 1.3,
                    }}
                  >
                    {ev.name}
                  </div>

                  {/* Meta Line */}
                  <div
                    style={{
                      fontSize: 'var(--text-xs)',
                      color: 'var(--color-foreground-muted)',
                      lineHeight: 1.5,
                    }}
                  >
                    {metaLine}
                  </div>

                  {/* Stage Badge & Action */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '2px' }}>
                    <span
                      style={{
                        fontSize: 'var(--text-xs)',
                        fontWeight: 600,
                        padding: '2px 8px',
                        borderRadius: '10px',
                        background: stageConf.bg,
                        color: stageConf.fg,
                      }}
                    >
                      {stageConf.label}
                    </span>

                    {(ev.projectId || ev.clientId) && (
                      <span
                        onClick={() => {
                          if (ev.projectId) router.push(`/events?project=${ev.projectId}`)
                          else if (ev.clientId) router.push(`/clients/${ev.clientId}`)
                        }}
                        style={{
                          fontSize: 'var(--text-xs)',
                          fontWeight: 600,
                          color: 'var(--color-primary)',
                          cursor: 'pointer',
                          padding: '2px 6px',
                          borderRadius: '4px',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.textDecoration = 'underline')}
                        onMouseLeave={e => (e.currentTarget.style.textDecoration = 'none')}
                      >
                        View →
                      </span>
                    )}
                  </div>

                  {/* Team Avatar Stack */}
                  {ev.team && ev.team.length > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                      <div style={{ display: 'flex' }}>
                        {ev.team.slice(0, 4).map((member, i) => (
                          <div
                            key={i}
                            title={member.name}
                            style={{
                              width: '24px',
                              height: '24px',
                              borderRadius: '50%',
                              background: 'var(--color-surface-overlay)',
                              border: '2px solid var(--color-surface)',
                              color: 'var(--color-foreground-muted)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '9px',
                              fontWeight: 700,
                              marginLeft: i === 0 ? '0' : '-6px',
                              flexShrink: 0,
                              userSelect: 'none',
                            }}
                          >
                            {member.init}
                          </div>
                        ))}
                      </div>
                      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-subtle)' }}>
                        {ev.team.length} staff
                      </span>
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      </div>
      </div>
      {/* ── END DESKTOP VIEW ── */}

      {/* ── MOBILE VIEW (<768px): Sticky Week Glance + Vertical Agenda ── */}
      <div
        className="block md:hidden"
        {...backSwipeHandlers}
        style={{
          padding: '14px 14px 90px 14px',
          fontFamily: 'var(--font-inter)',
          minHeight: '100vh',
          boxSizing: 'border-box',
        }}
      >
        {/* Mobile Header: Month title, Prev/Next, Today */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '14px',
          }}
        >
          <div>
            <h1
              style={{
                fontSize: 'var(--text-xl)',
                fontWeight: 700,
                color: 'var(--color-foreground)',
                margin: 0,
                letterSpacing: '-0.02em',
              }}
            >
              {format(currentDate, 'MMMM yyyy')}
            </h1>
            <p
              style={{
                fontSize: 'var(--text-xs)',
                color: 'var(--color-foreground-muted)',
                margin: '2px 0 0 0',
              }}
            >
              Swipe or tap dates to inspect shoots
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button
              onClick={handleToday}
              style={{
                fontSize: 'var(--text-xs)',
                fontWeight: 600,
                padding: '6px 12px',
                borderRadius: '8px',
                background: 'var(--color-surface-raised)',
                border: '0.5px solid var(--color-border)',
                color: 'var(--color-foreground)',
                minHeight: '40px',
                minWidth: '40px',
                cursor: 'pointer',
              }}
            >
              Today
            </button>
            <button
              onClick={handlePrev}
              title="Previous Month"
              style={{
                width: '40px',
                height: '40px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '8px',
                background: 'var(--color-surface-raised)',
                border: '0.5px solid var(--color-border)',
                color: 'var(--color-foreground-muted)',
                cursor: 'pointer',
              }}
            >
              <i className="ti ti-chevron-left" style={{ fontSize: '18px' }} />
            </button>
            <button
              onClick={handleNext}
              title="Next Month"
              style={{
                width: '40px',
                height: '40px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '8px',
                background: 'var(--color-surface-raised)',
                border: '0.5px solid var(--color-border)',
                color: 'var(--color-foreground-muted)',
                cursor: 'pointer',
              }}
            >
              <i className="ti ti-chevron-right" style={{ fontSize: '18px' }} />
            </button>
          </div>
        </div>

        {/* 15.7.1 Sticky Week Glance Bar */}
        <div
          style={{
            position: 'sticky',
            top: '56px',
            zIndex: 30,
            background: 'var(--color-surface)',
            border: '0.5px solid var(--color-border)',
            borderRadius: '12px',
            padding: '10px 8px',
            marginBottom: '16px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
          }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(7, 1fr)',
              gap: '4px',
              textAlign: 'center',
            }}
          >
            {mobileWeekDays.map(day => {
              const active = day.isSelected
              return (
                <div
                  key={day.dateStr}
                  onClick={() => setSelectedDateStr(day.dateStr)}
                  style={{
                    padding: '8px 2px',
                    borderRadius: '8px',
                    background: active ? 'var(--color-primary)' : 'transparent',
                    color: active
                      ? '#ffffff'
                      : day.isToday
                      ? 'var(--color-primary)'
                      : 'var(--color-foreground)',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '4px',
                    minHeight: '44px',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <span
                    style={{
                      fontSize: '10px',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                      opacity: active ? 0.9 : 0.7,
                    }}
                  >
                    {day.dayName}
                  </span>
                  <span
                    style={{
                      fontSize: 'var(--text-sm)',
                      fontWeight: active || day.isToday ? 700 : 500,
                    }}
                  >
                    {day.dayNum}
                  </span>
                  {day.hasEvents && (
                    <div
                      style={{
                        width: '4px',
                        height: '4px',
                        borderRadius: '50%',
                        background: active ? '#ffffff' : 'var(--color-secondary)',
                      }}
                    />
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Selected Date Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '12px',
            padding: '0 2px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              style={{
                fontSize: 'var(--text-sm)',
                fontWeight: 600,
                color: 'var(--color-foreground)',
              }}
            >
              {selectedDayHeaderLabel}
            </span>
            {selectedDayEvents.length > 0 && (
              <span
                style={{
                  fontSize: 'var(--text-xs)',
                  fontWeight: 600,
                  padding: '2px 8px',
                  borderRadius: '10px',
                  background: 'var(--color-primary-muted)',
                  color: 'var(--color-primary)',
                }}
              >
                {selectedDayEvents.length} shoot{selectedDayEvents.length > 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>

        {/* Selected Day Event Cards */}
        {selectedDayEvents.length === 0 ? (
          <div
            style={{
              padding: '20px',
              borderRadius: '12px',
              background: 'var(--color-surface)',
              border: '0.5px solid var(--color-border)',
              textAlign: 'center',
              marginBottom: '20px',
            }}
          >
            <i
              className="ti ti-calendar-off"
              style={{ fontSize: '24px', color: 'var(--color-foreground-subtle)', marginBottom: '6px' }}
            />
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-foreground-muted)', margin: 0 }}>
              No events scheduled for this day
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '24px' }}>
            {selectedDayEvents.map(ev => {
              const stageConf = getStageConfig(ev.stage)
              return (
                <div
                  key={ev.id}
                  onClick={() => setMobileDrawerEvent(ev)}
                  style={{
                    background: 'var(--color-surface)',
                    border: '0.5px solid var(--color-border)',
                    borderRadius: '12px',
                    padding: '14px',
                    cursor: 'pointer',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.04)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          width: '32px',
                          height: '32px',
                          borderRadius: '8px',
                          background: 'var(--color-primary-muted)',
                          color: 'var(--color-primary)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}
                      >
                        <i className={`ti ${getEventTypeIcon(ev.eventType)}`} style={{ fontSize: '16px' }} />
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: 'var(--text-sm)',
                            fontWeight: 600,
                            color: 'var(--color-foreground)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {ev.name}
                        </div>
                        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-muted)' }}>
                          {ev.clientName}
                        </div>
                      </div>
                    </div>
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: 600,
                        padding: '2px 8px',
                        borderRadius: '6px',
                        background: stageConf.bg,
                        color: stageConf.fg,
                        flexShrink: 0,
                      }}
                    >
                      {stageConf.label}
                    </span>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: '12px',
                      marginTop: '12px',
                      paddingTop: '10px',
                      borderTop: '0.5px solid var(--color-border)',
                      fontSize: 'var(--text-xs)',
                      color: 'var(--color-foreground-muted)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <i className="ti ti-clock" />
                      <span>{ev.startTime || '09:00'} - {ev.endTime || '18:00'}</span>
                    </div>
                    {ev.location && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <i className="ti ti-map-pin" />
                        <span style={{ maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {ev.location}
                        </span>
                      </div>
                    )}
                    {ev.team && ev.team.length > 0 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginLeft: 'auto' }}>
                        <i className="ti ti-users" />
                        <span>{ev.team.length} crew</span>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* 15.7.1 Infinite Chronological Agenda for Month */}
        <div style={{ marginTop: '20px' }}>
          <div
            style={{
              fontSize: 'var(--text-xs)',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color: 'var(--color-foreground-subtle)',
              marginBottom: '12px',
              paddingLeft: '2px',
            }}
          >
            All Events in {format(currentDate, 'MMMM yyyy')} ({mobileAgendaDays.reduce((acc, d) => acc + d.events.length, 0)})
          </div>

          {mobileAgendaDays.length === 0 ? (
            <div
              style={{
                padding: '24px',
                borderRadius: '12px',
                background: 'var(--color-surface)',
                border: '0.5px solid var(--color-border)',
                textAlign: 'center',
              }}
            >
              <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-foreground-muted)', margin: 0 }}>
                No events recorded for this entire month.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {mobileAgendaDays.map(agendaDay => (
                <div key={agendaDay.dateStr}>
                  {/* Date section subheader */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      marginBottom: '8px',
                      paddingLeft: '4px',
                    }}
                  >
                    <span
                      style={{
                        fontSize: 'var(--text-xs)',
                        fontWeight: 600,
                        color: agendaDay.isToday ? 'var(--color-primary)' : 'var(--color-foreground-muted)',
                      }}
                    >
                      {agendaDay.dateLabel}
                    </span>
                    {agendaDay.isToday && (
                      <span
                        style={{
                          fontSize: '10px',
                          fontWeight: 700,
                          padding: '1px 6px',
                          borderRadius: '4px',
                          background: 'var(--color-primary)',
                          color: '#ffffff',
                        }}
                      >
                        TODAY
                      </span>
                    )}
                  </div>

                  {/* Day Events */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {agendaDay.events.map(ev => {
                      const stageConf = getStageConfig(ev.stage)
                      return (
                        <div
                          key={ev.id}
                          onClick={() => setMobileDrawerEvent(ev)}
                          style={{
                            background: 'var(--color-surface)',
                            border: '0.5px solid var(--color-border)',
                            borderRadius: '10px',
                            padding: '12px',
                            cursor: 'pointer',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                            <div style={{ minWidth: 0 }}>
                              <div
                                style={{
                                  fontSize: 'var(--text-sm)',
                                  fontWeight: 600,
                                  color: 'var(--color-foreground)',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {ev.name}
                              </div>
                              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-foreground-muted)' }}>
                                {ev.clientName} • {ev.startTime || '09:00'}
                              </div>
                            </div>
                            <span
                              style={{
                                fontSize: '10px',
                                fontWeight: 600,
                                padding: '2px 6px',
                                borderRadius: '4px',
                                background: stageConf.bg,
                                color: stageConf.fg,
                                flexShrink: 0,
                              }}
                            >
                              {stageConf.label}
                            </span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 15.3 & 15.8 Mobile Event Detail Bottom Sheet Drawer */}
      {mobileDrawerEvent && (
        <>
          {/* Backdrop Scrim */}
          <div
            onClick={() => setMobileDrawerEvent(null)}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.7)',
              backdropFilter: 'blur(4px)',
              zIndex: 9990,
            }}
          />

          {/* Drawer Panel */}
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
              zIndex: 9995,
              maxHeight: '85vh',
              overflowY: 'auto',
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

            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
              <div>
                <h3
                  style={{
                    fontSize: 'var(--text-lg)',
                    fontWeight: 700,
                    color: 'var(--color-foreground)',
                    margin: 0,
                  }}
                >
                  {mobileDrawerEvent.name}
                </h3>
                <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-foreground-muted)', margin: '4px 0 0 0' }}>
                  {mobileDrawerEvent.clientName}
                </p>
              </div>
              <span
                style={{
                  fontSize: 'var(--text-xs)',
                  fontWeight: 600,
                  padding: '3px 10px',
                  borderRadius: '6px',
                  background: getStageConfig(mobileDrawerEvent.stage).bg,
                  color: getStageConfig(mobileDrawerEvent.stage).fg,
                }}
              >
                {getStageConfig(mobileDrawerEvent.stage).label}
              </span>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '12px',
                marginTop: '18px',
                padding: '14px',
                borderRadius: '10px',
                background: 'var(--color-surface-raised)',
                border: '0.5px solid var(--color-border)',
              }}
            >
              <div>
                <span style={{ fontSize: '11px', color: 'var(--color-foreground-subtle)', display: 'block' }}>DATE</span>
                <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-foreground)' }}>
                  {mobileDrawerEvent.dateStr}
                </span>
              </div>
              <div>
                <span style={{ fontSize: '11px', color: 'var(--color-foreground-subtle)', display: 'block' }}>TIMINGS</span>
                <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-foreground)' }}>
                  {mobileDrawerEvent.startTime || '09:00'} - {mobileDrawerEvent.endTime || '18:00'}
                </span>
              </div>
              {mobileDrawerEvent.callTime && (
                <div>
                  <span style={{ fontSize: '11px', color: 'var(--color-foreground-subtle)', display: 'block' }}>CALL TIME</span>
                  <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-foreground)' }}>
                    {mobileDrawerEvent.callTime}
                  </span>
                </div>
              )}
              {mobileDrawerEvent.location && (
                <div>
                  <span style={{ fontSize: '11px', color: 'var(--color-foreground-subtle)', display: 'block' }}>LOCATION</span>
                  <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-foreground)' }}>
                    {mobileDrawerEvent.location}
                  </span>
                </div>
              )}
            </div>

            {/* Crew assigned */}
            {mobileDrawerEvent.team && mobileDrawerEvent.team.length > 0 && (
              <div style={{ marginTop: '16px' }}>
                <span style={{ fontSize: '11px', color: 'var(--color-foreground-subtle)', display: 'block', marginBottom: '8px' }}>
                  ASSIGNED CREW ({mobileDrawerEvent.team.length})
                </span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {mobileDrawerEvent.team.map((m, idx) => (
                    <div
                      key={idx}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '4px 10px',
                        borderRadius: '20px',
                        background: 'var(--color-surface-raised)',
                        border: '0.5px solid var(--color-border)',
                        fontSize: 'var(--text-xs)',
                        color: 'var(--color-foreground)',
                      }}
                    >
                      <div
                        style={{
                          width: '18px',
                          height: '18px',
                          borderRadius: '50%',
                          background: 'var(--color-primary-muted)',
                          color: 'var(--color-primary)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '8px',
                          fontWeight: 700,
                        }}
                      >
                        {m.init}
                      </div>
                      <span>{m.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', gap: '10px', marginTop: '24px' }}>
              {(mobileDrawerEvent.projectId || mobileDrawerEvent.clientId) && (
                <button
                  onClick={() => {
                    if (mobileDrawerEvent.clientId) {
                      router.push(`/clients/${mobileDrawerEvent.clientId}`)
                    }
                  }}
                  style={{
                    flex: 1,
                    height: '44px',
                    borderRadius: '8px',
                    background: 'var(--color-primary)',
                    color: '#ffffff',
                    border: 'none',
                    fontWeight: 600,
                    fontSize: 'var(--text-sm)',
                    cursor: 'pointer',
                  }}
                >
                  View Client Record
                </button>
              )}
              <button
                onClick={() => setMobileDrawerEvent(null)}
                style={{
                  height: '44px',
                  padding: '0 18px',
                  borderRadius: '8px',
                  background: 'var(--color-surface-raised)',
                  color: 'var(--color-foreground)',
                  border: '0.5px solid var(--color-border)',
                  fontWeight: 600,
                  fontSize: 'var(--text-sm)',
                  cursor: 'pointer',
                }}
              >
                Close
              </button>
            </div>
          </div>
        </>
      )}
    </>
  )
}
