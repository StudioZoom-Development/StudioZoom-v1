import {
  collection,
  onSnapshot,
  collectionGroup,
} from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import type {
  Client,
  Expense,
  Project,
  WorkItem,
  AppUser,
  TimeLog,
  Checkout,
  EventDateEntry,
} from '@/types'
import { getTodayDateString, subscribeToAllTodayTimeLogs } from './timeLogs'

export interface DashboardEventItem {
  id: string
  projectId?: string
  clientId: string
  name: string
  clientName: string
  eventDate: Date
  startTime?: string
  venue?: string
  stage: string
  packageType?: string
  team: { name: string; init: string; role?: string }[]
}

export interface DashboardAttendanceItem {
  uid: string
  name: string
  role: string
  time: string
  checkInTime?: string
  totalMinutes?: number
  runningSince?: number
  status: 'present' | 'late' | 'notInYet'
}

export interface DashboardCheckoutItem {
  checkoutId: string
  itemName: string
  itemCode?: string
  staffName: string
  dueBackDate: Date
  isOverdue: boolean
}

export interface DashboardAggregates {
  // Financials (Admin only)
  revenueMtd: number
  revenueGrowthPct: number
  pendingReceivables: number
  overdueClientsCount: number
  cashflowMonths: {
    month: string
    year?: number
    fullMonthLabel?: string
    income: number
    outflow: number
    net: number
  }[]

  // Operational (Admin & Manager)
  activeProjectsCount: number
  eventsThisMonthCount: number
  overdueEditingTasksCount: number
  awaitingClientReviewCount: number
  gearOnFieldCount: number
  gearOverdueCount: number

  // Feeds & Radars
  upcomingEvents: DashboardEventItem[]
  attendanceSummary: {
    totalStaff: number
    clockedInCount: number
    records: DashboardAttendanceItem[]
  }
  postProdRadar: {
    photoTrack: { inProgress: number; inReview: number; completed: number }
    albumTrack: { inProgress: number; inReview: number; completed: number }
    videoTrack: { inProgress: number; inReview: number; completed: number }
    fullVideoTrack: { inProgress: number; inReview: number; completed: number }
  }
  recentCheckouts: DashboardCheckoutItem[]
}

function parseDateSafe(val: unknown): Date | null {
  if (!val) return null
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val
  if (typeof (val as { toDate?: () => Date })?.toDate === 'function') {
    const d = (val as { toDate: () => Date }).toDate()
    return isNaN(d.getTime()) ? null : d
  }
  if (typeof val === 'object' && val !== null && 'seconds' in val && typeof (val as { seconds: number }).seconds === 'number') {
    const d = new Date((val as { seconds: number }).seconds * 1000)
    return isNaN(d.getTime()) ? null : d
  }
  if (typeof val === 'object' && val !== null && '_seconds' in val && typeof (val as { _seconds: number })._seconds === 'number') {
    const d = new Date((val as { _seconds: number })._seconds * 1000)
    return isNaN(d.getTime()) ? null : d
  }
  if (typeof val === 'string' || typeof val === 'number') {
    const d = new Date(val)
    return isNaN(d.getTime()) ? null : d
  }
  return null
}

function getInitials(name: string): string {
  if (!name) return 'SZ'
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

/**
 * Main reactive aggregator for the Studio Zoom executive & operations dashboard.
 * Listens to underlying collections and produces a unified snapshot.
 */
export function subscribeToDashboardData(
  onData: (data: DashboardAggregates) => void
): () => void {
  let clients: Client[] = []
  let clientPayments: { amount: number; date: Date }[] = []
  let projects: Project[] = []
  let workItems: WorkItem[] = []
  let staffList: AppUser[] = []
  let todayTimeLogs: TimeLog[] = []
  let activeCheckouts: Checkout[] = []
  let expenses: Expense[] = []

  const computeAndEmit = () => {
    const now = new Date()
    const currentYear = now.getFullYear()
    const currentMonth = now.getMonth() // 0-indexed

    // ─── 1. Financials (MTD & Receivables) ──────────────────────────────────
    let revenueMtd = 0
    let revenueLastMonth = 0

    // Sum from actual client payments
    for (const p of clientPayments) {
      if (!p.date || isNaN(p.date.getTime())) continue
      const pYear = p.date.getFullYear()
      const pMonth = p.date.getMonth()
      if (pYear === currentYear && pMonth === currentMonth) {
        revenueMtd += p.amount
      } else if (
        (currentMonth === 0 && pYear === currentYear - 1 && pMonth === 11) ||
        (pYear === currentYear && pMonth === currentMonth - 1)
      ) {
        revenueLastMonth += p.amount
      }
    }

    // Fallback: If no collectionGroup payments exist yet for clients with advance payments
    if (revenueMtd === 0 && clientPayments.length === 0) {
      for (const c of clients) {
        if (c.isDeleted) continue
        const raw = c as unknown as Record<string, unknown>
        const advance = Number(raw.advanceAmount) || 0
        const advDate = parseDateSafe(raw.advanceDate)
        if (advance > 0 && advDate) {
          if (advDate.getFullYear() === currentYear && advDate.getMonth() === currentMonth) {
            revenueMtd += advance
          }
        }
      }
    }

    const revenueGrowthPct = revenueLastMonth > 0
      ? Math.round(((revenueMtd - revenueLastMonth) / revenueLastMonth) * 100)
      : revenueMtd > 0 ? 100 : 0

    // Pending Receivables
    let pendingReceivables = 0
    let overdueClientsCount = 0
    for (const c of clients) {
      if (c.isDeleted) continue
      const bal = Number(c.balanceDue) || 0
      if (bal > 0) {
        pendingReceivables += bal
        const eventDate = parseDateSafe(c.eventDate) || now
        if (c.paymentStatus === 'overdue' || eventDate.getTime() < now.getTime()) {
          overdueClientsCount++
        }
      }
    }

    // ─── 2. Active Projects & Events This Month ────────────────────────────
    let activeProjectsCount = 0
    let eventsThisMonthCount = 0

    for (const p of projects) {
      if (p.isDeleted) continue
      if (['planning', 'preProduction', 'eventDay', 'postProduction', 'booked'].includes(p.stage)) {
        activeProjectsCount++
      }
      if (p.eventDate) {
        const d = parseDateSafe(p.eventDate)
        if (d && d.getFullYear() === currentYear && d.getMonth() === currentMonth) {
          eventsThisMonthCount++
        }
      }
    }

    // If projects is empty, fallback to clients
    if (activeProjectsCount === 0) {
      for (const c of clients) {
        if (c.isDeleted || c.status === 'inquiry') continue
        if (['planning', 'preProduction', 'eventDay', 'postProduction', 'booked'].includes(c.stage || c.status)) {
          activeProjectsCount++
        }
        if (c.eventDate) {
          const d = parseDateSafe(c.eventDate)
          if (d && d.getFullYear() === currentYear && d.getMonth() === currentMonth) {
            eventsThisMonthCount++
          }
        }
      }
    }

    // ─── 3. Upcoming Events Timeline (Next 14 Days) ─────────────────────────
    const upcomingEvents: DashboardEventItem[] = []
    const startOfWindow = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0)
    const endOfWindow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 14, 23, 59, 59)

    // Helper map of staff names
    const staffMap = new Map<string, AppUser>()
    for (const s of staffList) staffMap.set(s.uid, s)

    for (const c of clients) {
      if (c.isDeleted || c.status === 'inquiry') continue

      const matchingProject = projects.find(p => p.clientId === c.clientId && !p.isDeleted)
      const teamIds = matchingProject?.staffUids || c.staffUids || []
      const team = teamIds.slice(0, 3).map(uid => {
        const s = staffMap.get(uid)
        const name = s?.name || 'Staff'
        return { name, init: getInitials(name), role: s?.role }
      })

      const rawEventDates = Array.isArray(c.eventDates) && c.eventDates.length > 0 ? c.eventDates : null

      if (rawEventDates) {
        let addedAny = false
        rawEventDates.forEach((ed: EventDateEntry, idx: number) => {
          const edDate = parseDateSafe(ed.date)
          if (edDate && edDate >= startOfWindow && edDate <= endOfWindow) {
            addedAny = true
            const sessionLabel = (typeof ed.label === 'string' && ed.label.trim())
              ? ed.label.trim()
              : `Day ${idx + 1}`

            upcomingEvents.push({
              id: `${matchingProject?.projectId || c.clientId}_${ed.id || idx}`,
              projectId: matchingProject?.projectId,
              clientId: c.clientId,
              name: `${c.eventName || c.name || 'Studio Event'}${sessionLabel ? ` · ${sessionLabel}` : ''}`,
              clientName: c.name || 'Client',
              eventDate: edDate,
              startTime: (typeof ed.startTime === 'string' && ed.startTime) || c.startTime || '09:00',
              venue: (typeof ed.location === 'string' && ed.location) || c.location || 'Avadi Studio',
              stage: matchingProject?.stage || c.stage || c.status || 'planning',
              packageType: c.packageType || 'Custom',
              team,
            })
          }
        })

        if (!addedAny) {
          const primaryDate = parseDateSafe(c.eventDate)
          if (primaryDate && primaryDate >= startOfWindow && primaryDate <= endOfWindow) {
            upcomingEvents.push({
              id: matchingProject?.projectId || c.clientId,
              projectId: matchingProject?.projectId,
              clientId: c.clientId,
              name: c.eventName || c.name || 'Studio Event',
              clientName: c.name || 'Client',
              eventDate: primaryDate,
              startTime: c.startTime || '09:00',
              venue: c.location || 'Avadi Studio',
              stage: matchingProject?.stage || c.stage || c.status || 'planning',
              packageType: c.packageType || 'Custom',
              team,
            })
          }
        }
      } else {
        const eventDate = parseDateSafe(c.eventDate)
        if (eventDate && eventDate >= startOfWindow && eventDate <= endOfWindow) {
          upcomingEvents.push({
            id: matchingProject?.projectId || c.clientId,
            projectId: matchingProject?.projectId,
            clientId: c.clientId,
            name: c.eventName || c.name || 'Studio Event',
            clientName: c.name || 'Client',
            eventDate,
            startTime: c.startTime || '09:00',
            venue: c.location || 'Avadi Studio',
            stage: matchingProject?.stage || c.stage || c.status || 'planning',
            packageType: c.packageType || 'Custom',
            team,
          })
        }
      }
    }

    // Sort upcoming events chronologically
    upcomingEvents.sort((a, b) => a.eventDate.getTime() - b.eventDate.getTime())

    // ─── 4. Work Board & Post-Production Radar ─────────────────────────────
    let overdueEditingTasksCount = 0
    let awaitingClientReviewCount = 0

    const postProdRadar = {
      photoTrack:     { inProgress: 0, inReview: 0, completed: 0 },
      albumTrack:     { inProgress: 0, inReview: 0, completed: 0 },
      videoTrack:     { inProgress: 0, inReview: 0, completed: 0 },
      fullVideoTrack: { inProgress: 0, inReview: 0, completed: 0 },
    }

    for (const item of workItems) {
      if (item.isDeleted) continue
      const dueDate = parseDateSafe(item.dueDate)
      const isPastDue = !!(dueDate && dueDate.getTime() < now.getTime() && item.status !== 'done')
      if (isPastDue) overdueEditingTasksCount++

      if (item.status === 'review') awaitingClientReviewCount++

      const trackKey = item.postProdTrackKey ||
        (item.type === 'photoEditing' || item.type === 'photoDesigning' ? 'photoTrack' :
         item.type === 'albumDesign' || item.type === 'albumDesigning' || item.type === 'albumCreating' ? 'albumTrack' :
         item.type === 'highlights' || item.type === 'highlightsEditing' || item.type === 'videoEditing' ? 'videoTrack' :
         item.type === 'fullFilm' || item.type === 'fullVideoEditing' ? 'fullVideoTrack' : null)

      if (trackKey && postProdRadar[trackKey]) {
        if (item.status === 'done') {
          postProdRadar[trackKey].completed++
        } else if (item.status === 'review') {
          postProdRadar[trackKey].inReview++
        } else if (item.status === 'inProgress' || item.status === 'todo') {
          postProdRadar[trackKey].inProgress++
        }
      }
    }

    // ─── 5. Attendance Pulse Today ──────────────────────────────────────────
    const currentlyClockedInUids = new Set<string>()
    const staffLogsMap = new Map<string, TimeLog[]>()

    for (const tl of todayTimeLogs) {
      if (!staffLogsMap.has(tl.staffUid)) {
        staffLogsMap.set(tl.staffUid, [])
      }
      staffLogsMap.get(tl.staffUid)!.push(tl)
      if (tl.status === 'open' && tl.checkInAt && tl.checkInAt.getFullYear() >= 2000) {
        currentlyClockedInUids.add(tl.staffUid)
      }
    }

    const attendanceRecords: DashboardAttendanceItem[] = staffList
      .filter(s => !s.isDeleted && s.isActive !== false && (s as unknown as { status?: string }).status !== 'inactive' && (s.role === 'staff' || s.role === 'manager' || staffLogsMap.has(s.uid)))
      .map(s => {
        const userLogs = staffLogsMap.get(s.uid) || []
        const openSession = userLogs.find(tl => tl.status === 'open' && tl.checkInAt && tl.checkInAt.getFullYear() >= 2000)
        const isClockedIn = !!openSession

        // Sum closed minutes
        const closedMinutes = userLogs
          .filter(tl => tl.status === 'closed' && typeof tl.workedMinutes === 'number' && tl.workedMinutes > 0)
          .reduce((sum, tl) => sum + Math.min(tl.workedMinutes ?? 0, 1440), 0)

        // Running session minutes
        let runningMinutes = 0
        let runningSince: number | undefined = undefined
        if (openSession && openSession.checkInAt) {
          runningSince = openSession.checkInAt.getTime()
          const diff = Math.floor((now.getTime() - runningSince) / 60000)
          if (diff > 0 && diff <= 1440) runningMinutes = diff
        }

        const totalMinutes = closedMinutes + runningMinutes

        let timeStr = 'Not in yet'
        if (isClockedIn || totalMinutes > 0) {
          const h = Math.floor(totalMinutes / 60)
          const m = totalMinutes % 60
          timeStr = h > 0 ? `${h}h ${m}m` : `${m}m`
        }

        let firstCheckInTimeStr: string | undefined = undefined
        const validLogs = userLogs
          .filter(tl => tl.checkInAt && tl.checkInAt.getFullYear() >= 2000)
          .sort((a, b) => a.checkInAt.getTime() - b.checkInAt.getTime())
        if (validLogs.length > 0) {
          firstCheckInTimeStr = validLogs[0].checkInAt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
        }

        return {
          uid: s.uid,
          name: s.name,
          role: (s.role || 'staff').toUpperCase(),
          time: timeStr,
          checkInTime: firstCheckInTimeStr,
          totalMinutes: closedMinutes,
          runningSince,
          status: isClockedIn ? 'present' : 'notInYet',
        }
      })

    // Sort: clocked-in staff first, then staff with hours today, then alphabetical by name
    attendanceRecords.sort((a, b) => {
      if (a.status === 'present' && b.status !== 'present') return -1
      if (a.status !== 'present' && b.status === 'present') return 1
      const aHasHours = a.time !== 'Not in yet'
      const bHasHours = b.time !== 'Not in yet'
      if (aHasHours && !bHasHours) return -1
      if (!aHasHours && bHasHours) return 1
      return (a.name || '').localeCompare(b.name || '')
    })

    const attendanceSummary = {
      totalStaff: attendanceRecords.length,
      clockedInCount: currentlyClockedInUids.size,
      records: attendanceRecords,
    }

    // ─── 6. Equipment & Checkouts ───────────────────────────────────────────
    let gearOnFieldCount = 0
    let gearOverdueCount = 0
    const recentCheckouts: DashboardCheckoutItem[] = []

    for (const co of activeCheckouts) {
      gearOnFieldCount++
      const dueBack = parseDateSafe((co as unknown as Record<string, unknown>).dueBack) || now
      const isOverdue = co.status === 'overdue' || (dueBack.getTime() < now.getTime() && co.status !== 'returned')
      if (isOverdue) gearOverdueCount++

      if (recentCheckouts.length < 5) {
        recentCheckouts.push({
          checkoutId: co.checkoutId,
          itemName: co.itemName || 'Camera Gear',
          itemCode: co.itemCode,
          staffName: co.staffName || 'Staff Member',
          dueBackDate: dueBack,
          isOverdue,
        })
      }
    }

    // ─── 7. Cashflow Mini Strip (Last 6 Months) ─────────────────────────────
    const monthlyMap = new Map<string, { income: number; outflow: number }>()
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      monthlyMap.set(key, { income: 0, outflow: 0 })
    }

    for (const p of clientPayments) {
      if (!p.date || isNaN(p.date.getTime())) continue
      const key = `${p.date.getFullYear()}-${String(p.date.getMonth() + 1).padStart(2, '0')}`
      if (monthlyMap.has(key)) {
        monthlyMap.get(key)!.income += p.amount
      }
    }

    for (const e of expenses) {
      if (e.isDeleted) continue
      const date = parseDateSafe(e.date)
      if (!date) continue
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
      if (monthlyMap.has(key)) {
        monthlyMap.get(key)!.outflow += Number(e.amount) || 0
      }
    }

    const cashflowMonths = Array.from(monthlyMap.entries()).map(([key, data]) => {
      const [yr, mo] = key.split('-')
      const d = new Date(Number(yr), Number(mo) - 1, 1)
      const monthLabel = d.toLocaleString('en-US', { month: 'short' })
      const fullMonthLabel = d.toLocaleString('en-US', { month: 'long', year: 'numeric' })
      return {
        month: monthLabel,
        year: Number(yr),
        fullMonthLabel,
        income: data.income,
        outflow: data.outflow,
        net: data.income - data.outflow,
      }
    })

    // Emit consolidated reactive snapshot
    onData({
      revenueMtd,
      revenueGrowthPct,
      pendingReceivables,
      overdueClientsCount,
      cashflowMonths,
      activeProjectsCount,
      eventsThisMonthCount,
      overdueEditingTasksCount,
      awaitingClientReviewCount,
      gearOnFieldCount,
      gearOverdueCount,
      upcomingEvents,
      attendanceSummary,
      postProdRadar,
      recentCheckouts,
    })
  }

  // Set up listeners with unsubscribe handlers
  const unsubClients = onSnapshot(collection(db, 'clients'), (snap) => {
    clients = snap.docs
      .filter(d => !d.data().isDeleted)
      .map(d => ({ clientId: d.id, ...(d.data() as object) } as Client))
    computeAndEmit()
  }, () => {})

  const unsubPayments = onSnapshot(collectionGroup(db, 'payments'), (snap) => {
    clientPayments = snap.docs.map(d => {
      const data = d.data()
      const date = parseDateSafe(data.date) || new Date()
      return {
        amount: Number(data.amount) || 0,
        date,
      }
    })
    computeAndEmit()
  }, () => {})

  const unsubProjects = onSnapshot(collection(db, 'projects'), (snap) => {
    projects = snap.docs
      .filter(d => !d.data().isDeleted)
      .map(d => ({ projectId: d.id, ...(d.data() as object) } as Project))
    computeAndEmit()
  }, () => {})

  const unsubWorkItems = onSnapshot(collection(db, 'workItems'), (snap) => {
    workItems = snap.docs.map(d => ({ workItemId: d.id, ...(d.data() as object) } as WorkItem))
    computeAndEmit()
  }, () => {})

  const unsubStaff = onSnapshot(collection(db, 'users'), (snap) => {
    staffList = snap.docs
      .filter(d => !d.data().isDeleted)
      .map(d => ({ uid: d.id, ...(d.data() as object) } as AppUser))
    computeAndEmit()
  }, () => {})

  const todayStr = getTodayDateString()
  const unsubTimeLogs = subscribeToAllTodayTimeLogs(todayStr, (logs) => {
    todayTimeLogs = logs
    computeAndEmit()
  })

  const unsubCheckouts = onSnapshot(collection(db, 'checkouts'), (snap) => {
    activeCheckouts = snap.docs
      .map(d => ({ checkoutId: d.id, ...(d.data() as object) } as Checkout))
      .filter(c => c.status === 'out' || c.status === 'overdue')
    computeAndEmit()
  }, () => {})

  const unsubExpenses = onSnapshot(collection(db, 'expenses'), (snap) => {
    expenses = snap.docs
      .filter(d => !d.data().isDeleted)
      .map(d => ({ expenseId: d.id, ...(d.data() as object) } as Expense))
    computeAndEmit()
  }, () => {})

  return () => {
    unsubClients()
    unsubPayments()
    unsubProjects()
    unsubWorkItems()
    unsubStaff()
    unsubTimeLogs()
    unsubCheckouts()
    unsubExpenses()
  }
}
